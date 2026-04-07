import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const hiddenStatuses = ['cancelled', 'rejected', 'picked_up'];
const activeQueueStatuses = ['boarding', 'queued'];

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
      .select('id, route, plate_number, departure_time, status, created_at, updated_at')
      .eq('operator_user_id', user.id)
      .in('status', activeQueueStatuses)
      .order('updated_at', { ascending: false })
      .limit(5);

    if (queueError) {
      return NextResponse.json(
        { error: queueError.message || 'Failed to load current boarding queue.' },
        { status: 500 }
      );
    }

    const prioritizedQueues = [...(queueRows || [])].sort((a, b) => {
      const rankA = a.status === 'boarding' ? 0 : 1;
      const rankB = b.status === 'boarding' ? 0 : 1;
      if (rankA !== rankB) return rankA - rankB;

      const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
      const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    const currentQueue = prioritizedQueues[0];
    if (!currentQueue) {
      return NextResponse.json({
        queue: null,
        passengers: [],
      });
    }

    const { data: reservationRows, error: reservationError } = await serviceClient
      .from('tbl_reservations')
      .select(
        'id, full_name, contact_number, pickup_location, route, seat_count, amount_due, status, created_at, paid_at'
      )
      .eq('operator_user_id', user.id)
      .eq('queue_id', currentQueue.id)
      .not('status', 'in', `(${hiddenStatuses.join(',')})`)
      .order('created_at', { ascending: false })
      .limit(200);

    if (reservationError) {
      return NextResponse.json(
        { error: reservationError.message || 'Failed to load passengers.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      queue: {
        id: currentQueue.id,
        route: currentQueue.route || '',
        plate_number: currentQueue.plate_number || '',
        departure_time: currentQueue.departure_time || null,
        status: currentQueue.status || 'boarding',
      },
      passengers: reservationRows || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unexpected server error.' },
      { status: 500 }
    );
  }
}
