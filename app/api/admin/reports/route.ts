import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type AdminContext = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

type ReservationRow = {
  id: string;
  full_name: string;
  contact_number: string;
  pickup_location: string;
  route: string;
  seat_labels: string[] | null;
  seat_count: number | null;
  amount_due: number | null;
  status: string | null;
  payment_id: string | null;
  paid_at: string | null;
  created_at: string;
  operator_user_id: string | null;
  queue_id: string | null;
};

type ApplicationRow = {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  contact_number: string;
  address: string;
  plate_number: string;
  vehicle_model: string;
  seating_capacity: number | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
};

type QueueMeta = {
  plate_number: string;
  queue_status: string;
};

type UserMeta = {
  full_name: string;
  email: string;
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
  if (message === 'invalid_date_range') return 400;
  return 400;
};

const isPaidLike = (status?: string | null) => {
  const s = (status || '').toLowerCase();
  return s === 'paid' || s === 'confirmed' || s === 'pending_operator_approval';
};

const isConfirmedStatus = (status?: string | null) =>
  (status || '').toLowerCase() === 'confirmed';

const isWalkInReservation = (row: {
  pickup_location?: string | null;
  payment_id?: string | null;
}) =>
  String(row.pickup_location || '').toUpperCase() === 'WALK_IN' ||
  String(row.payment_id || '').toLowerCase() === 'walk_in';

const DEFAULT_DOWNPAYMENT_PER_SEAT = Number(
  process.env.DEFAULT_DOWNPAYMENT_PER_SEAT || '50'
);

const isDiscountedReservation = (row: {
  seat_count?: number | null;
  amount_due?: number | null;
  pickup_location?: string | null;
  payment_id?: string | null;
}) => {
  if (isWalkInReservation(row)) return false;
  const seats = Number(row.seat_count || 0);
  if (seats <= 0) return false;
  const amount = Number(row.amount_due || 0);
  const baseline = seats * DEFAULT_DOWNPAYMENT_PER_SEAT;
  return amount < baseline;
};

const toDateInput = (value: Date) => {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseDateRange = (req: NextRequest) => {
  const fromParam = (req.nextUrl.searchParams.get('from') || '').trim();
  const toParam = (req.nextUrl.searchParams.get('to') || '').trim();
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/;

  const now = new Date();
  const to = new Date(now);
  to.setUTCHours(23, 59, 59, 999);

  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  from.setUTCHours(0, 0, 0, 0);

  let fromDate = from;
  let toDate = to;

  if (fromParam) {
    if (!isDateOnly.test(fromParam)) throw new Error('invalid_date_range');
    fromDate = new Date(`${fromParam}T00:00:00.000Z`);
  }
  if (toParam) {
    if (!isDateOnly.test(toParam)) throw new Error('invalid_date_range');
    toDate = new Date(`${toParam}T23:59:59.999Z`);
  }

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error('invalid_date_range');
  }
  if (fromDate.getTime() > toDate.getTime()) {
    throw new Error('invalid_date_range');
  }

  return {
    fromIso: fromDate.toISOString(),
    toIso: toDate.toISOString(),
    fromDateInput: toDateInput(fromDate),
    toDateInput: toDateInput(toDate),
  };
};

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAdminContext(req);
    const { fromIso, toIso, fromDateInput, toDateInput } = parseDateRange(req);

    const supabase = createClient(ctx.supabaseUrl, ctx.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [reservationRes, applicationRes] = await Promise.all([
      supabase
        .from('tbl_reservations')
        .select(
          'id, full_name, contact_number, pickup_location, route, seat_labels, seat_count, amount_due, status, payment_id, paid_at, created_at, operator_user_id, queue_id'
        )
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase
        .from('tbl_operator_applications')
        .select(
          'id, user_id, full_name, email, contact_number, address, plate_number, vehicle_model, seating_capacity, status, admin_notes, created_at'
        )
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false })
        .limit(5000),
    ]);

    if (reservationRes.error) {
      throw new Error(reservationRes.error.message || 'Failed to load reservation reports.');
    }
    if (applicationRes.error) {
      throw new Error(applicationRes.error.message || 'Failed to load application reports.');
    }

    const reservations = (reservationRes.data || []) as ReservationRow[];
    const applications = (applicationRes.data || []) as ApplicationRow[];

    const queueIds = Array.from(
      new Set(reservations.map((row) => row.queue_id).filter(Boolean))
    ) as string[];
    const operatorIds = Array.from(
      new Set(reservations.map((row) => row.operator_user_id).filter(Boolean))
    ) as string[];

    const [queueRes, userRes] = await Promise.all([
      queueIds.length
        ? supabase
            .from('tbl_van_queue')
            .select('id, plate_number, status')
            .in('id', queueIds)
        : Promise.resolve({ data: [], error: null } as any),
      operatorIds.length
        ? supabase
            .from('tbl_users')
            .select('user_id, full_name, email')
            .in('user_id', operatorIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (queueRes.error) {
      throw new Error(queueRes.error.message || 'Failed to load queue metadata.');
    }
    if (userRes.error) {
      throw new Error(userRes.error.message || 'Failed to load operator metadata.');
    }

    const queueMap = new Map<string, QueueMeta>(
      (queueRes.data || []).map((queue: any) => [
        queue.id as string,
        {
          plate_number: queue.plate_number || 'N/A',
          queue_status: queue.status || 'queued',
        },
      ])
    );
    const userMap = new Map<string, UserMeta>(
      (userRes.data || []).map((row: any) => [
        row.user_id as string,
        {
          full_name: row.full_name || 'Unknown operator',
          email: row.email || '',
        },
      ])
    );

    const bookingRows = reservations.map((row) => {
      const queue = row.queue_id ? queueMap.get(row.queue_id) : undefined;
      const operator = row.operator_user_id
        ? userMap.get(row.operator_user_id)
        : undefined;
      return {
        reservation_id: row.id,
        reservation_code: `#${row.id.slice(0, 8)}`,
        passenger_name: row.full_name || 'Unknown passenger',
        contact_number: row.contact_number || '',
        pickup_location: row.pickup_location || '',
        route: row.route || '',
        seat_labels: row.seat_labels || [],
        seat_count: Number(row.seat_count || 0),
        amount_due: Number(row.amount_due || 0),
        status: row.status || 'pending_payment',
        payment_id: row.payment_id || null,
        paid_at: row.paid_at,
        created_at: row.created_at,
        is_discounted: isDiscountedReservation({
          seat_count: row.seat_count,
          amount_due: row.amount_due,
          pickup_location: row.pickup_location,
          payment_id: row.payment_id,
        }),
        operator_name: operator?.full_name || 'Unassigned',
        operator_email: operator?.email || '',
        plate_number: queue?.plate_number || 'N/A',
        queue_status: queue?.queue_status || 'unknown',
      };
    });

    const paymentRows = bookingRows
      .filter((row) => row.payment_id || row.paid_at || isPaidLike(row.status))
      .map((row) => ({
        reservation_id: row.reservation_id,
        reservation_code: row.reservation_code,
        payment_id: row.payment_id || 'N/A',
        paid_at: row.paid_at || row.created_at,
        passenger_name: row.passenger_name,
        route: row.route,
        seat_count: row.seat_count,
        amount_due: row.amount_due,
        status: row.status,
        is_discounted: row.is_discounted,
        operator_name: row.operator_name,
      }));

    const applicationRows = applications.map((row) => ({
      application_id: row.id,
      applicant_name: row.full_name || 'Unknown applicant',
      email: row.email || '',
      contact_number: row.contact_number || '',
      address: row.address || '',
      plate_number: row.plate_number || '',
      vehicle_model: row.vehicle_model || '',
      seating_capacity: Number(row.seating_capacity || 0),
      status: row.status || 'pending',
      admin_notes: row.admin_notes || '',
      created_at: row.created_at,
      user_id: row.user_id || '',
    }));

    const totalRevenue = paymentRows.reduce((sum, row) => sum + row.amount_due, 0);
    const totalPassengers = bookingRows.reduce(
      (sum, row) => sum + Number(row.seat_count || 0),
      0
    );
    const boardedPassengers = bookingRows.reduce((sum, row) => {
      if (!isConfirmedStatus(row.status)) return sum;
      return sum + Number(row.seat_count || 0);
    }, 0);
    const discountedPassengers = bookingRows.reduce((sum, row) => {
      if (!isConfirmedStatus(row.status) || !row.is_discounted) return sum;
      return sum + Number(row.seat_count || 0);
    }, 0);

    return NextResponse.json({
      range: {
        from: fromDateInput,
        to: toDateInput,
      },
      summary: {
        bookings: bookingRows.length,
        payments: paymentRows.length,
        applications: applicationRows.length,
        total_revenue: totalRevenue,
        passengers_total: totalPassengers,
        passengers_boarded: boardedPassengers,
        passengers_discounted: discountedPassengers,
      },
      bookings: bookingRows,
      payments: paymentRows,
      applications: applicationRows,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to load reports.';
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}
