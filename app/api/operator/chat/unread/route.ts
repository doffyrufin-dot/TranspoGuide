import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type ReservationRow = {
  id: string;
  full_name: string | null;
  route: string | null;
  status: string | null;
};

type MessageRow = {
  reservation_id: string;
  sender_type: 'passenger' | 'operator';
  created_at: string;
};

const CHAT_GRACE_MINUTES = 30;
const ACTIVE_QUEUE_STATUSES = ['queued', 'boarding'];

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json({ error: 'server_env_missing' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!token) {
      return NextResponse.json({ error: 'missing_auth_token' }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: queueRows, error: queueError } = await serviceClient
      .from('tbl_van_queue')
      .select('id, status, updated_at')
      .eq('operator_user_id', user.id)
      .in('status', [...ACTIVE_QUEUE_STATUSES, 'cancelled'])
      .order('updated_at', { ascending: false })
      .limit(80);

    if (queueError) {
      return NextResponse.json(
        { error: queueError.message || 'Failed to load queues.' },
        { status: 500 }
      );
    }

    const queueList = (queueRows || []) as QueueRow[];
    const nowMs = Date.now();
    const graceMs = CHAT_GRACE_MINUTES * 60 * 1000;
    const eligibleQueueIds = queueList
      .filter((row: QueueRow) => {
        const status = String(row.status || '').toLowerCase();
        if (ACTIVE_QUEUE_STATUSES.includes(status)) return true;
        if (status !== 'cancelled') return false;
        const leftAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
        if (!leftAt || Number.isNaN(leftAt)) return false;
        return nowMs - leftAt <= graceMs;
      })
      .map((row: QueueRow) => row.id)
      .filter(Boolean);

    if (!eligibleQueueIds.length) {
      return NextResponse.json({
        unreadThreadCount: 0,
        unreadThreads: [],
      });
    }

    const { data: reservationRows, error: reservationError } = await serviceClient
      .from('tbl_reservations')
      .select('id, full_name, route, status, queue_id')
      .eq('operator_user_id', user.id)
      .in('queue_id', eligibleQueueIds)
      .not('status', 'in', '(cancelled,rejected,picked_up)')
      .order('created_at', { ascending: false })
      .limit(120);

    if (reservationError) {
      return NextResponse.json(
        { error: reservationError.message || 'Failed to load reservations.' },
        { status: 500 }
      );
    }

    const reservations = (reservationRows || []) as ReservationRow[];
    const reservationIds = reservations.map((row) => row.id).filter(Boolean);
    if (!reservationIds.length) {
      return NextResponse.json({
        unreadThreadCount: 0,
        unreadThreads: [],
      });
    }

    const { data: messageRows, error: messageError } = await serviceClient
      .from('tbl_reservation_messages')
      .select('reservation_id, sender_type, created_at')
      .in('reservation_id', reservationIds)
      .order('created_at', { ascending: false })
      .limit(600);

    if (messageError) {
      return NextResponse.json(
        { error: messageError.message || 'Failed to load chat messages.' },
        { status: 500 }
      );
    }

    const latestByReservation = new Map<string, MessageRow>();
    for (const row of (messageRows || []) as MessageRow[]) {
      if (!latestByReservation.has(row.reservation_id)) {
        latestByReservation.set(row.reservation_id, row);
      }
    }

    const reservationMap = new Map(
      reservations.map((row) => [row.id, row] as const)
    );

    const unreadThreads = [...latestByReservation.entries()]
      .filter(([, message]) => message.sender_type === 'passenger')
      .map(([reservationId, message]) => {
        const reservation = reservationMap.get(reservationId);
        return {
          reservation_id: reservationId,
          passenger_name: reservation?.full_name || 'Passenger',
          route: reservation?.route || '',
          status: reservation?.status || '',
          latest_at: message.created_at,
        };
      });

    return NextResponse.json({
      unreadThreadCount: unreadThreads.length,
      unreadThreads,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unexpected server error.' },
      { status: 500 }
    );
  }
}
