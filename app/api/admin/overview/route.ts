import { NextRequest, NextResponse } from 'next/server';
import { requireAdminServiceClient } from '@/lib/server/admin-auth';

type ReservationRow = {
  id: string;
  created_at: string;
  paid_at: string | null;
  amount_due: number | null;
  status: string | null;
};

const isPaidLike = (status?: string | null) => {
  const s = (status || '').toLowerCase();
  return s === 'paid' || s === 'confirmed';
};

const toStatus = (message: string) => {
  if (message === 'missing_auth_token' || message === 'unauthorized') return 401;
  if (message === 'forbidden') return 403;
  if (message === 'server_env_missing') return 500;
  return 400;
};

const startOfWeekMonday = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

export async function GET(req: NextRequest) {
  try {
    const { serviceClient: supabase } = await requireAdminServiceClient(req);

    const now = new Date();
    const weekStart = startOfWeekMonday(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const [bookingsCountRes, activeVansRes, pendingAppsRes, reservationsRes] =
      await Promise.all([
        supabase.from('tbl_reservations').select('id', { count: 'exact', head: true }),
        supabase
          .from('tbl_van_queue')
          .select('id', { count: 'exact', head: true })
          .in('status', ['queued', 'boarding']),
        supabase
          .from('tbl_operator_applications')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('tbl_reservations')
          .select('id, created_at, paid_at, amount_due, status')
          .gte('created_at', weekStart.toISOString())
          .lt('created_at', weekEnd.toISOString())
          .order('created_at', { ascending: true }),
      ]);

    const { data: allRevenueRows, error: allRevenueError } = await supabase
      .from('tbl_reservations')
      .select('amount_due, status')
      .in('status', ['paid', 'confirmed']);

    if (bookingsCountRes.error) {
      throw new Error(bookingsCountRes.error.message || 'Failed to load bookings count.');
    }
    if (activeVansRes.error) {
      throw new Error(activeVansRes.error.message || 'Failed to load active vans count.');
    }
    if (pendingAppsRes.error) {
      throw new Error(pendingAppsRes.error.message || 'Failed to load pending applications count.');
    }
    if (reservationsRes.error) {
      throw new Error(reservationsRes.error.message || 'Failed to load weekly reservations.');
    }
    if (allRevenueError) {
      throw new Error(allRevenueError.message || 'Failed to load total revenue.');
    }

    const weeklyRows = (reservationsRes.data || []) as ReservationRow[];
    const weekDays = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + idx);
      return d;
    });

    const bookingMap = new Map<string, number>();
    const revenueMap = new Map<string, number>();
    for (const d of weekDays) {
      const key = dayKey(d);
      bookingMap.set(key, 0);
      revenueMap.set(key, 0);
    }

    for (const row of weeklyRows) {
      const created = new Date(row.created_at);
      if (!Number.isNaN(created.getTime())) {
        const key = dayKey(created);
        bookingMap.set(key, (bookingMap.get(key) || 0) + 1);
      }

      if (isPaidLike(row.status)) {
        const paidDate = new Date(row.paid_at || row.created_at);
        if (!Number.isNaN(paidDate.getTime())) {
          const key = dayKey(paidDate);
          if (revenueMap.has(key)) {
            revenueMap.set(key, (revenueMap.get(key) || 0) + Number(row.amount_due || 0));
          }
        }
      }
    }

    const weeklyRevenue = weeklyRows.reduce((acc, row) => {
      if (!isPaidLike(row.status)) return acc;
      return acc + Number(row.amount_due || 0);
    }, 0);

    const totalRevenue = (allRevenueRows || []).reduce((acc: number, row: any) => {
      return acc + Number(row.amount_due || 0);
    }, 0);

    return NextResponse.json(
      {
        stats: {
          totalBookings: Number(bookingsCountRes.count || 0),
          activeVans: Number(activeVansRes.count || 0),
          totalRevenue: Number(totalRevenue || 0),
          weeklyRevenue: Number(weeklyRevenue || 0),
          pendingIssues: Number(pendingAppsRes.count || 0),
        },
        weekly: {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          bookings: weekDays.map((d) => bookingMap.get(dayKey(d)) || 0),
          revenue: weekDays.map((d) => revenueMap.get(dayKey(d)) || 0),
        },
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=20, stale-while-revalidate=40',
        },
      }
    );
  } catch (error: any) {
    const message = error?.message || 'Failed to load overview.';
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}

