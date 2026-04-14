import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type ReservationRow = {
  id: string;
  full_name: string | null;
  route: string | null;
  status: string | null;
  operator_chat_seen_at?: string | null;
};

type QueueRow = {
  id: string;
  status: string | null;
  updated_at: string | null;
};

type MessageRow = {
  reservation_id: string;
  sender_type: 'passenger' | 'operator';
  message?: string | null;
  created_at: string;
};

const CHAT_GRACE_MINUTES = 30;
const ACTIVE_QUEUE_STATUSES = ['queued', 'boarding'];
const isMissingSeenColumnError = (error: unknown) => {
  const msg = String((error as { message?: string } | null)?.message || '').toLowerCase();
  return msg.includes('operator_chat_seen_at') && msg.includes('column');
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

    let supportsSeenTracking = true;
    let reservationRows: ReservationRow[] = [];

    const reservationRead = await serviceClient
      .from('tbl_reservations')
      .select('id, full_name, route, status, queue_id, operator_chat_seen_at')
      .eq('operator_user_id', user.id)
      .in('queue_id', eligibleQueueIds)
      .not('status', 'in', '(cancelled,rejected,picked_up)')
      .order('created_at', { ascending: false })
      .limit(120);

    if (reservationRead.error && isMissingSeenColumnError(reservationRead.error)) {
      supportsSeenTracking = false;
      const fallbackRead = await serviceClient
        .from('tbl_reservations')
        .select('id, full_name, route, status, queue_id')
        .eq('operator_user_id', user.id)
        .in('queue_id', eligibleQueueIds)
        .not('status', 'in', '(cancelled,rejected,picked_up)')
        .order('created_at', { ascending: false })
        .limit(120);

      if (fallbackRead.error) {
        return NextResponse.json(
          { error: fallbackRead.error.message || 'Failed to load reservations.' },
          { status: 500 }
        );
      }
      reservationRows = (fallbackRead.data || []) as ReservationRow[];
    } else if (reservationRead.error) {
      return NextResponse.json(
        { error: reservationRead.error.message || 'Failed to load reservations.' },
        { status: 500 }
      );
    } else {
      reservationRows = (reservationRead.data || []) as ReservationRow[];
    }

    const reservations = reservationRows;
    const reservationIds = reservations.map((row) => row.id).filter(Boolean);
    if (!reservationIds.length) {
      return NextResponse.json({
        unreadThreadCount: 0,
        unreadThreads: [],
      });
    }

    const { data: messageRows, error: messageError } = await serviceClient
      .from('tbl_reservation_messages')
      .select('reservation_id, sender_type, message, created_at')
      .in('reservation_id', reservationIds)
      .order('created_at', { ascending: false })
      .limit(600);

    if (messageError) {
      return NextResponse.json(
        { error: messageError.message || 'Failed to load chat messages.' },
        { status: 500 }
      );
    }

    const allMessages = (messageRows || []) as MessageRow[];
    const reservationMap = new Map(
      reservations.map((row) => [row.id, row] as const)
    );
    const latestByReservation = new Map<string, MessageRow>();
    const messagesByReservation = new Map<string, MessageRow[]>();
    const unreadByReservation = new Map<string, number>();

    for (const row of allMessages) {
      if (!latestByReservation.has(row.reservation_id)) {
        latestByReservation.set(row.reservation_id, row);
      }
      const existing = messagesByReservation.get(row.reservation_id);
      if (existing) {
        existing.push(row);
      } else {
        messagesByReservation.set(row.reservation_id, [row]);
      }
      if (unreadByReservation.has(row.reservation_id)) {
        continue;
      }
      unreadByReservation.set(row.reservation_id, 0);
    }

    // Seen-aware unread count: count passenger messages after operator opened the chat.
    // Fallback to legacy behavior if the seen column is not yet available.
    for (const reservationId of reservationIds) {
      const rowsForReservation = messagesByReservation.get(reservationId) || [];
      let count = 0;

      if (!supportsSeenTracking) {
        for (const row of rowsForReservation) {
          if (row.sender_type === 'operator') break;
          if (row.sender_type === 'passenger') count += 1;
        }
        unreadByReservation.set(reservationId, count);
        continue;
      }

      const seenAtRaw = reservationMap.get(reservationId)?.operator_chat_seen_at || null;
      const seenAtMs = seenAtRaw ? new Date(seenAtRaw).getTime() : 0;
      const hasSeenAt = Boolean(seenAtMs && !Number.isNaN(seenAtMs));

      for (const row of rowsForReservation) {
        if (row.sender_type !== 'passenger') continue;
        if (hasSeenAt) {
          const messageMs = new Date(row.created_at).getTime();
          if (!Number.isNaN(messageMs) && messageMs <= seenAtMs) {
            continue;
          }
        }
        count += 1;
      }
      unreadByReservation.set(reservationId, count);
    }

    const unreadThreads = [...latestByReservation.entries()]
      .filter(([reservationId, message]) => {
        const unread = Number(unreadByReservation.get(reservationId) || 0);
        return message.sender_type === 'passenger' && unread > 0;
      })
      .map(([reservationId, message]) => {
        const reservation = reservationMap.get(reservationId);
        return {
          reservation_id: reservationId,
          passenger_name: reservation?.full_name || 'Passenger',
          route: reservation?.route || '',
          status: reservation?.status || '',
          latest_at: message.created_at,
          unread_count: Number(unreadByReservation.get(reservationId) || 0),
        };
      });

    return NextResponse.json({
      unreadThreadCount: unreadThreads.length,
      unreadThreads,
      unreadByReservation: Object.fromEntries(unreadByReservation.entries()),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unexpected server error.' },
      { status: 500 }
    );
  }
}
