import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type ReservationRow = {
  id: string;
  full_name: string;
  route: string;
  seat_count: number | null;
  amount_due: number | null;
  status: string | null;
  payment_id: string | null;
  paid_at: string | null;
  created_at: string;
};

const isPaidLike = (status?: string | null) => {
  const s = (status || '').toLowerCase();
  return s === 'paid' || s === 'confirmed';
};

export async function GET(req: NextRequest) {
  try {
    const pageParam = Number(req.nextUrl.searchParams.get('page') || '1');
    const pageSizeParam = Number(req.nextUrl.searchParams.get('pageSize') || '10');
    const page = Number.isFinite(pageParam) ? Math.max(1, Math.floor(pageParam)) : 1;
    const pageSize = Number.isFinite(pageSizeParam)
      ? Math.max(1, Math.min(50, Math.floor(pageSizeParam)))
      : 10;

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

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await adminClient
      .from('tbl_reservations')
      .select(
        'id, full_name, route, seat_count, amount_due, status, payment_id, paid_at, created_at'
      )
      .eq('operator_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Failed to load operator payments.' },
        { status: 500 }
      );
    }

    const rows = (data || []) as ReservationRow[];
    const paidRows = rows.filter((r) => isPaidLike(r.status));
    const total = paidRows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pagedRows = paidRows.slice(startIndex, endIndex);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const sumFrom = (from: Date) =>
      paidRows.reduce((acc, row) => {
        const date = new Date(row.paid_at || row.created_at);
        if (Number.isNaN(date.getTime()) || date < from) return acc;
        return acc + Number(row.amount_due || 0);
      }, 0);

    return NextResponse.json({
      summary: {
        today: sumFrom(startOfDay),
        week: sumFrom(startOfWeek),
        month: sumFrom(startOfMonth),
      },
      payments: pagedRows.map((row) => ({
        id: row.id,
        passenger: row.full_name || 'Passenger',
        route: row.route || '-',
        seats: Number(row.seat_count || 0),
        amount: Number(row.amount_due || 0),
        status: row.status || 'paid',
        paymentId: row.payment_id,
        paidAt: row.paid_at,
        createdAt: row.created_at,
      })),
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
        hasNext: safePage < totalPages,
        hasPrev: safePage > 1,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unexpected server error.' },
      { status: 500 }
    );
  }
}
