import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CHAT_GRACE_MINUTES = 30;
const ACTIVE_QUEUE_STATUSES = ['queued', 'boarding'];

type QueueRow = {
  id: string;
  status: string;
  updated_at: string | null;
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
      .limit(200);

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
      .not('status', 'in', '(rejected,cancelled)')
      .order('created_at', { ascending: false })
      .limit(300);

    if (reservationError) {
      return NextResponse.json(
        { error: reservationError.message || 'Failed to load chat conversations.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      conversations: rows || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unexpected server error.' },
      { status: 500 }
    );
  }
}
