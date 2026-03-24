import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  assignWalkInSeat,
  getOperatorTripSeatMap,
  releaseWalkInSeat,
} from '@/lib/db/reservations';

type AdminContext = {
  userId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
};

const getAdminContext = async (req: NextRequest): Promise<AdminContext> => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('server_env_missing');
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) throw new Error('missing_auth_token');

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);
  if (userError || !user) throw new Error('unauthorized');

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: roleRows, error: roleError } = await serviceClient
    .from('tbl_users')
    .select('role')
    .eq('user_id', user.id)
    .limit(1);

  if (roleError) throw new Error(roleError.message || 'Failed to verify admin role.');
  const role = (roleRows?.[0]?.role || '').toLowerCase();
  if (role !== 'admin') throw new Error('forbidden');

  return { userId: user.id, supabaseUrl, serviceRoleKey };
};

const toStatus = (message: string) => {
  if (message === 'missing_auth_token' || message === 'unauthorized') return 401;
  if (message === 'forbidden') return 403;
  if (message === 'server_env_missing') return 500;
  return 400;
};

const getQueueRow = async (ctx: AdminContext, queueId: string) => {
  const supabase = createClient(ctx.supabaseUrl, ctx.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: queueRows, error } = await supabase
    .from('tbl_van_queue')
    .select('id, operator_user_id, route, status')
    .eq('id', queueId)
    .limit(1);

  if (error) throw new Error(error.message || 'Failed to load queue row.');
  const queue = queueRows?.[0];
  if (!queue) throw new Error('Queue entry not found.');
  if (!['queued', 'boarding'].includes((queue.status || '').toLowerCase())) {
    throw new Error('Queue entry is not active.');
  }

  return queue;
};

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAdminContext(req);
    const tripKey = req.nextUrl.searchParams.get('tripKey')?.trim() || '';
    const operatorUserId =
      req.nextUrl.searchParams.get('operatorUserId')?.trim() || '';

    if (!tripKey || !operatorUserId) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }

    const result = await getOperatorTripSeatMap({
      operatorUserId,
      tripKey,
    });

    return NextResponse.json({
      ok: true,
      trip_key: result.tripKey,
      seats: result.seats,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to load admin seat map.';
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAdminContext(req);
    const body = await req.json();
    const queueId = (body.queueId || '').trim();
    const tripKey = (body.tripKey || '').trim();
    const seatLabel = (body.seatLabel || '').trim();
    const passengerName = (body.passengerName || '').trim();

    if (!queueId || !tripKey || !seatLabel || !passengerName) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }

    const queue = await getQueueRow(ctx, queueId);

    await assignWalkInSeat({
      operatorUserId: queue.operator_user_id,
      route: queue.route || '',
      tripKey,
      seatLabel,
      passengerName,
      queueId: queue.id,
    });

    const result = await getOperatorTripSeatMap({
      operatorUserId: queue.operator_user_id,
      tripKey,
    });

    return NextResponse.json({
      ok: true,
      trip_key: result.tripKey,
      seats: result.seats,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to assign walk-in seat.';
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAdminContext(req);
    const body = await req.json();
    const queueId = (body.queueId || '').trim();
    const tripKey = (body.tripKey || '').trim();
    const seatLabel = (body.seatLabel || '').trim();

    if (!queueId || !tripKey || !seatLabel) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }

    const queue = await getQueueRow(ctx, queueId);

    await releaseWalkInSeat({
      operatorUserId: queue.operator_user_id,
      tripKey,
      seatLabel,
    });

    const result = await getOperatorTripSeatMap({
      operatorUserId: queue.operator_user_id,
      tripKey,
    });

    return NextResponse.json({
      ok: true,
      trip_key: result.tripKey,
      seats: result.seats,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to release walk-in seat.';
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}
