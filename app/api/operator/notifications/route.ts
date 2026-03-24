import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type NotificationItem = {
  id: string;
  title: string;
  description: string;
  created_at: string;
};

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json({ error: 'server_env_missing' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!token) {
      return NextResponse.json({ error: 'missing_auth_token' }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
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

    const { data: reservationRows, error: reservationError } = await serviceClient
      .from('tbl_reservations')
      .select('id, full_name, route, status, paid_at, created_at, updated_at')
      .eq('operator_user_id', user.id)
      .in('status', ['pending_operator_approval', 'pending_payment'])
      .order('updated_at', { ascending: false })
      .limit(12);

    if (reservationError) {
      return NextResponse.json(
        { error: reservationError.message || 'Failed to load notifications.' },
        { status: 500 }
      );
    }

    const rows = reservationRows || [];
    const unreadCount = rows.length;

    const notifications: NotificationItem[] = rows.map((row: any) => {
      const baseDate = row.updated_at || row.paid_at || row.created_at || new Date().toISOString();
      return {
        id: `res-${row.id}`,
        title: 'New reservation request',
        description: `${row.full_name || 'Passenger'} - ${row.route || 'Route not set'}`,
        created_at: baseDate,
      };
    });

    return NextResponse.json({
      unreadCount,
      notifications,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unexpected error.' },
      { status: 500 }
    );
  }
}
