import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type AdminContext = {
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

  return { supabaseUrl, serviceRoleKey };
};

const toStatus = (message: string) => {
  if (message === 'missing_auth_token' || message === 'unauthorized') return 401;
  if (message === 'forbidden') return 403;
  if (message === 'server_env_missing') return 500;
  return 400;
};

const toDisplayStatus = (status: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'pending_payment' || s === 'pending_operator_approval' || s === 'paid') {
    return 'Pending';
  }
  if (s === 'confirmed') return 'Confirmed';
  if (s === 'rejected' || s === 'cancelled') return 'Cancelled';
  return 'Pending';
};

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAdminContext(req);
    const scope = (req.nextUrl.searchParams.get('scope') || 'boarding').toLowerCase();
    const allowedScope = scope === 'active' ? 'active' : 'boarding';

    const supabase = createClient(ctx.supabaseUrl, ctx.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const queueStatuses = allowedScope === 'active' ? ['boarding', 'queued'] : ['boarding'];

    const { data: queueRows, error: queueError } = await supabase
      .from('tbl_van_queue')
      .select('id, operator_user_id, route, plate_number, status, queue_position')
      .in('status', queueStatuses)
      .order('queue_position', { ascending: true });

    if (queueError) {
      throw new Error(queueError.message || 'Failed to load queue entries.');
    }

    const queueIds = (queueRows || []).map((row: any) => row.id).filter(Boolean);
    if (queueIds.length === 0) {
      return NextResponse.json({ bookings: [], scope: allowedScope });
    }

    const operatorIds = Array.from(
      new Set((queueRows || []).map((row: any) => row.operator_user_id).filter(Boolean))
    );

    const { data: userRows } = operatorIds.length
      ? await supabase
          .from('tbl_users')
          .select('user_id, full_name, email')
          .in('user_id', operatorIds)
      : { data: [] as any[] };

    const userMap = new Map(
      (userRows || []).map((u: any) => [
        u.user_id,
        { full_name: u.full_name || null, email: u.email || null },
      ])
    );

    const { data: reservationRows, error: reservationError } = await supabase
      .from('tbl_reservations')
      .select(
        'id, full_name, contact_number, route, seat_count, amount_due, status, created_at, paid_at, queue_id, operator_user_id'
      )
      .in('queue_id', queueIds)
      .order('created_at', { ascending: false })
      .limit(500);

    if (reservationError) {
      throw new Error(reservationError.message || 'Failed to load reservations.');
    }

    const queueMap = new Map(
      (queueRows || []).map((q: any) => [
        q.id,
        {
          id: q.id,
          route: q.route || '',
          plate: q.plate_number || 'N/A',
          status: q.status || 'queued',
        },
      ])
    );

    const bookings = (reservationRows || []).map((row: any) => {
      const queue = queueMap.get(row.queue_id) || {
        id: null,
        route: row.route || '',
        plate: 'N/A',
        status: 'queued',
      };
      const operator = userMap.get(row.operator_user_id) || {
        full_name: 'Unknown operator',
        email: '',
      };

      return {
        id: row.id,
        passenger: row.full_name || 'Unknown passenger',
        contact: row.contact_number || '',
        route: row.route || queue.route || '',
        seats: Number(row.seat_count || 0),
        amount: Number(row.amount_due || 0),
        status: toDisplayStatus(row.status || ''),
        raw_status: row.status || '',
        created_at: row.created_at,
        paid_at: row.paid_at,
        operator_name: operator.full_name || 'Unknown operator',
        operator_email: operator.email || '',
        queue_status: queue.status,
        plate_number: queue.plate,
      };
    });

    return NextResponse.json({
      scope: allowedScope,
      bookings,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to load admin bookings.';
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}
