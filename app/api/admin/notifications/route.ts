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

    const { data: userRows, error: roleError } = await serviceClient
      .from('tbl_users')
      .select('role')
      .eq('user_id', user.id)
      .limit(1);

    if (roleError) {
      return NextResponse.json({ error: roleError.message || 'role_check_failed' }, { status: 500 });
    }

    const role = String(userRows?.[0]?.role || '').toLowerCase();
    if (role !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const { data: appRows, error: appError } = await serviceClient
      .from('tbl_operator_applications')
      .select('id, full_name, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(15);

    if (appError) {
      return NextResponse.json(
        { error: appError.message || 'Failed to load notifications.' },
        { status: 500 }
      );
    }

    const rows = appRows || [];
    const notifications: NotificationItem[] = rows.map((row: any) => ({
        id: `app-${row.id}`,
        title: 'New operator application',
        description: `${row.full_name || 'Applicant'} submitted an application`,
        created_at: row.created_at,
      }));

    return NextResponse.json({
      unreadCount: notifications.length,
      notifications,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unexpected error.' },
      { status: 500 }
    );
  }
}
