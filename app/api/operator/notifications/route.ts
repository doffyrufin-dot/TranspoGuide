import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type NotificationItem = {
  id: string;
  title: string;
  description: string;
  created_at: string;
  target_tab?: 'Reservations' | 'Settings';
};

const isMissingSchemaError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  const code = String(err.code || '').toUpperCase();
  const message = String(err.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find the table')
  );
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
    const notifications: NotificationItem[] = rows.map((row: any) => {
      const baseDate = row.updated_at || row.paid_at || row.created_at || new Date().toISOString();
      return {
        id: `res-${row.id}`,
        title: 'New reservation request',
        description: `${row.full_name || 'Passenger'} - ${row.route || 'Route not set'}`,
        created_at: baseDate,
        target_tab: 'Reservations',
      };
    });

    const [{ data: appRows }, { data: paymentAccountRows, error: paymentAccountError }] =
      await Promise.all([
        serviceClient
          .from('tbl_operator_applications')
          .select('status, updated_at, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1),
        serviceClient
          .from('tbl_operator_payment_accounts')
          .select('id, paymongo_secret_key, is_active, updated_at, created_at')
          .eq('operator_user_id', user.id)
          .order('is_active', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(5),
      ]);

    if (paymentAccountError && !isMissingSchemaError(paymentAccountError)) {
      return NextResponse.json(
        { error: paymentAccountError.message || 'Failed to load notifications.' },
        { status: 500 }
      );
    }

    const appStatus = String((appRows?.[0] as any)?.status || '')
      .trim()
      .toLowerCase();
    const safePaymentRows = paymentAccountRows || [];
    const activePaymentAccount =
      safePaymentRows.find((row: any) => row.is_active) ||
      safePaymentRows[0] ||
      null;
    const hasOperatorKey = !!String(
      activePaymentAccount?.paymongo_secret_key || ''
    ).trim();

    if (appStatus === 'approved' && !hasOperatorKey) {
      const setupDate =
        String(activePaymentAccount?.updated_at || '').trim() ||
        String(activePaymentAccount?.created_at || '').trim() ||
        String((appRows?.[0] as any)?.updated_at || '').trim() ||
        String((appRows?.[0] as any)?.created_at || '').trim() ||
        new Date().toISOString();

      notifications.unshift({
        id: 'setup-payment-account',
        title: 'Complete payout setup',
        description:
          'Add your PayMongo Secret Key in Settings so downpayments go to your account.',
        created_at: setupDate,
        target_tab: 'Settings',
      });
    }

    const unreadCount = notifications.length;

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
