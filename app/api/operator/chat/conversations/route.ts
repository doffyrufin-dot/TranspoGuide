import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CHAT_GRACE_MINUTES = 30;
const ACTIVE_QUEUE_STATUSES = ['queued', 'boarding'];

type QueueRow = {
  id: string;
  status: string;
  updated_at: string | null;
};

type ReservationRow = {
  id: string;
  full_name: string;
  contact_number: string;
  pickup_location: string;
  route: string;
  seat_count: number;
  amount_due: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  queue_id: string | null;
};

type MessageRow = {
  reservation_id: string;
  message: string;
  created_at: string;
  sender_type: 'passenger' | 'operator';
};

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
        { error: queueError.message || 'Failed to load operator queues.' },
        { status: 500 }
      );
    }

    const nowMs = Date.now();
    const graceMs = CHAT_GRACE_MINUTES * 60 * 1000;
    const eligibleQueueIds = (queueRows || [])
      .filter((row: QueueRow) => {
        if (!row?.id) return false;
        const status = String(row.status || '').toLowerCase();
        if (ACTIVE_QUEUE_STATUSES.includes(status)) return true;
        if (status !== 'cancelled') return false;
        const leftAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
        if (!leftAt || Number.isNaN(leftAt)) return false;
        return nowMs - leftAt <= graceMs;
      })
      .map((row: QueueRow) => row.id);

    if (!eligibleQueueIds.length) {
      return NextResponse.json({ conversations: [] });
    }

    const { data: rows, error: reservationError } = await serviceClient
      .from('tbl_reservations')
      .select(
        'id, full_name, contact_number, pickup_location, route, seat_count, amount_due, status, created_at, paid_at, queue_id'
      )
      .eq('operator_user_id', user.id)
      .in('queue_id', eligibleQueueIds)
      .not('status', 'in', '(rejected,cancelled,picked_up)')
      .order('created_at', { ascending: false })
      .limit(120);

    if (reservationError) {
      return NextResponse.json(
        { error: reservationError.message || 'Failed to load chat conversations.' },
        { status: 500 }
      );
    }

    const reservationRows = (rows || []) as ReservationRow[];
    const reservationIds = reservationRows.map((row) => row.id).filter(Boolean);

    if (!reservationIds.length) {
      return NextResponse.json({ conversations: [] });
    }

    const { data: messageRows, error: messageError } = await serviceClient
      .from('tbl_reservation_messages')
      .select('reservation_id, message, created_at, sender_type')
      .in('reservation_id', reservationIds)
      .order('created_at', { ascending: false })
      .limit(800);

    if (messageError) {
      return NextResponse.json(
        { error: messageError.message || 'Failed to load latest chat messages.' },
        { status: 500 }
      );
    }

    const latestByReservation = new Map<string, MessageRow>();
    for (const row of (messageRows || []) as MessageRow[]) {
      if (!latestByReservation.has(row.reservation_id)) {
        latestByReservation.set(row.reservation_id, row);
      }
    }

    const conversations = reservationRows
      .map((row) => {
        const latest = latestByReservation.get(row.id);
        return {
          ...row,
          latest_message: latest?.message || null,
          latest_message_at: latest?.created_at || null,
          latest_message_sender: latest?.sender_type || null,
        };
      })
      .filter((row) => !!row.latest_message_at)
      .sort((a, b) => {
        const aTime = new Date(
          a.latest_message_at || a.paid_at || a.created_at
        ).getTime();
        const bTime = new Date(
          b.latest_message_at || b.paid_at || b.created_at
        ).getTime();
        return bTime - aTime;
      });

    return NextResponse.json({
      conversations,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unexpected server error.' },
      { status: 500 }
    );
  }
}
