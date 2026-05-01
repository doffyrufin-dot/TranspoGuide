import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type NotificationItem = {
  id: string;
  title: string;
  description: string;
  created_at: string;
  target_tab?: 'Reservations' | 'Settings';
};

const PAYMENT_WAIT_MINUTES = 15;
const PAID_NOTIFICATION_WINDOW_HOURS = 24;

const toTimestamp = (value?: string | null) => {
  const iso = String(value || '').trim();
  if (!iso) return 0;
  const ts = new Date(iso).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const toIso = (value?: string | null) => {
  const ts = toTimestamp(value);
  if (!ts) return new Date().toISOString();
  return new Date(ts).toISOString();
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
      .in('status', ['pending_operator_approval', 'pending_payment', 'paid', 'confirmed'])
      .order('updated_at', { ascending: false })
      .limit(30);

    if (reservationError) {
      return NextResponse.json(
        { error: reservationError.message || 'Failed to load notifications.' },
        { status: 500 }
      );
    }

    const nowMs = Date.now();
    const pendingPaymentCutoffMs = nowMs - PAYMENT_WAIT_MINUTES * 60 * 1000;
    const paidCutoffMs =
      nowMs - PAID_NOTIFICATION_WINDOW_HOURS * 60 * 60 * 1000;
    const rows = reservationRows || [];
    const notifications: NotificationItem[] = [];

    for (const row of rows) {
      const status = String(row?.status || '').trim().toLowerCase();
      const route = String(row?.route || 'Route not set').trim() || 'Route not set';
      const passenger = String(row?.full_name || 'Passenger').trim() || 'Passenger';
      const updatedAtMs = toTimestamp(row?.updated_at);
      const paidAtMs = toTimestamp(row?.paid_at);
      const updatedAtIso = toIso(row?.updated_at || row?.created_at);

      if (status === 'pending_operator_approval') {
        notifications.push({
          id: `res-request-${row.id}-${updatedAtMs || toTimestamp(row?.created_at) || 0}`,
          title: 'New reservation request',
          description: `${passenger} - ${route}`,
          created_at: updatedAtIso,
          target_tab: 'Reservations',
        });
        continue;
      }

      if (status === 'pending_payment') {
        if (updatedAtMs > 0 && updatedAtMs < pendingPaymentCutoffMs) {
          // Hide stale unpaid requests after the allowed payment window.
          continue;
        }
        notifications.push({
          id: `res-awaiting-payment-${row.id}-${updatedAtMs || 0}`,
          title: 'Awaiting downpayment',
          description: `${passenger} - waiting payment (${route})`,
          created_at: updatedAtIso,
          target_tab: 'Reservations',
        });
        continue;
      }

      if (status === 'paid' || status === 'confirmed') {
        const paidOrUpdatedMs = paidAtMs || updatedAtMs;
        if (!paidOrUpdatedMs || paidOrUpdatedMs < paidCutoffMs) {
          continue;
        }
        notifications.push({
          id: `res-paid-${row.id}-${paidOrUpdatedMs}`,
          title: 'Downpayment received',
          description: `${passenger} paid downpayment - ${route}`,
          created_at: toIso(row?.paid_at || row?.updated_at || row?.created_at),
          target_tab: 'Reservations',
        });
      }
    }

    notifications.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

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

    return NextResponse.json(
      {
        unreadCount,
        notifications,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unexpected error.' },
      { status: 500 }
    );
  }
}
