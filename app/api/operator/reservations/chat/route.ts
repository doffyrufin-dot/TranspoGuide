import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  addReservationMessage,
  getReservationById,
  getReservationMessages,
} from '@/lib/db/reservations';

const CHAT_GRACE_MINUTES = 30;
const ACTIVE_QUEUE_STATUSES = ['queued', 'boarding'];
export const dynamic = 'force-dynamic';

const getAuthorizedOperatorId = async (req: NextRequest) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('server_env_missing');
  }

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!accessToken) {
    throw new Error('missing_auth_token');
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);
  if (userError || !user) {
    throw new Error('unauthorized');
  }

  return user.id;
};

const getEligibleQueueIds = async (operatorUserId: string) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('server_env_missing');
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: queueRows, error: queueError } = await serviceClient
    .from('tbl_van_queue')
    .select('id, status, updated_at')
    .eq('operator_user_id', operatorUserId)
    .in('status', [...ACTIVE_QUEUE_STATUSES, 'cancelled'])
    .order('updated_at', { ascending: false })
    .limit(200);

  if (queueError) {
    throw new Error(queueError.message || 'Failed to load operator queues.');
  }

  const nowMs = Date.now();
  const graceMs = CHAT_GRACE_MINUTES * 60 * 1000;
  return (queueRows || [])
    .filter((row: any) => {
      const status = String(row.status || '').toLowerCase();
      if (ACTIVE_QUEUE_STATUSES.includes(status)) return true;
      if (status !== 'cancelled') return false;
      const leftAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
      if (!leftAt || Number.isNaN(leftAt)) return false;
      return nowMs - leftAt <= graceMs;
    })
    .map((row: any) => row.id)
    .filter(Boolean);
};

const isMissingSeenColumnError = (error: unknown) => {
  const msg = String((error as { message?: string } | null)?.message || '').toLowerCase();
  return msg.includes('operator_chat_seen_at') && msg.includes('column');
};

const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('server_env_missing');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const markReservationChatSeen = async (
  reservationId: string,
  operatorUserId: string
) => {
  const serviceClient = getServiceClient();
  const { error } = await serviceClient
    .from('tbl_reservations')
    .update({
      operator_chat_seen_at: new Date().toISOString(),
    })
    .eq('id', reservationId)
    .eq('operator_user_id', operatorUserId);

  if (error) {
    if (isMissingSeenColumnError(error)) return;
    throw new Error(error.message || 'failed_mark_chat_seen');
  }
};

const ensureReservationOwnedByOperator = async (
  reservationId: string,
  operatorUserId: string
) => {
  const reservation = await getReservationById(reservationId);
  if (!reservation || reservation.reservation.operator_user_id !== operatorUserId) {
    throw new Error('forbidden_operator_chat');
  }
  const reservationStatus = String(reservation.reservation.status || '').toLowerCase();
  if (
    reservationStatus === 'picked_up' ||
    reservationStatus === 'rejected' ||
    reservationStatus === 'cancelled'
  ) {
    throw new Error('chat_closed');
  }

  const queueId = reservation.reservation.queue_id || null;
  if (!queueId) {
    throw new Error('forbidden_operator_chat');
  }

  const eligibleQueueIds = await getEligibleQueueIds(operatorUserId);
  if (!eligibleQueueIds.includes(queueId)) {
    throw new Error('forbidden_operator_chat');
  }
};

export async function GET(req: NextRequest) {
  try {
    const reservationId =
      (req.nextUrl.searchParams.get('reservationId') || '').trim();
    if (!reservationId) {
      return NextResponse.json({ error: 'missing_reservation_id' }, { status: 400 });
    }

    const operatorUserId = await getAuthorizedOperatorId(req);
    await ensureReservationOwnedByOperator(reservationId, operatorUserId);
    await markReservationChatSeen(reservationId, operatorUserId);

    const messages = await getReservationMessages(reservationId);
    return NextResponse.json(
      { messages },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    const msg = error?.message || 'Failed to load reservation messages.';
    if (msg === 'missing_auth_token') {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    if (msg === 'unauthorized') {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    if (msg === 'forbidden_operator_chat') {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    if (msg === 'chat_closed') {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg === 'server_env_missing') {
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const reservationId = (body.reservationId || '').trim();
    const message = (body.message || '').trim();
    const senderName = (body.senderName || 'Operator').trim();

    if (!reservationId || !message) {
      return NextResponse.json(
        { error: 'missing_reservation_id_or_message' },
        { status: 400 }
      );
    }

    const operatorUserId = await getAuthorizedOperatorId(req);
    await ensureReservationOwnedByOperator(reservationId, operatorUserId);

    const createdMessage = await addReservationMessage({
      reservationId,
      senderType: 'operator',
      senderName,
      message,
    });
    await markReservationChatSeen(reservationId, operatorUserId);

    return NextResponse.json({ ok: true, message: createdMessage });
  } catch (error: any) {
    const msg = error?.message || 'Failed to send message.';
    if (msg === 'missing_auth_token') {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    if (msg === 'unauthorized') {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    if (msg === 'forbidden_operator_chat') {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    if (msg === 'chat_closed') {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg === 'server_env_missing') {
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const reservationId = (body.reservationId || '').trim();

    if (!reservationId) {
      return NextResponse.json({ error: 'missing_reservation_id' }, { status: 400 });
    }

    const operatorUserId = await getAuthorizedOperatorId(req);
    await ensureReservationOwnedByOperator(reservationId, operatorUserId);
    await markReservationChatSeen(reservationId, operatorUserId);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const msg = error?.message || 'Failed to mark chat as seen.';
    if (msg === 'missing_auth_token') {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    if (msg === 'unauthorized') {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    if (msg === 'forbidden_operator_chat') {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    if (msg === 'chat_closed') {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg === 'server_env_missing') {
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
