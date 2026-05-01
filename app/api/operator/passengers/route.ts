import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const activeQueueStatuses = ['departed', 'boarding', 'queued'];
const pickupEligibleStatuses = ['confirmed', 'paid', 'departed'];
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const RESERVATION_INDEX_LIMIT = 3000;
const PASSENGER_VISIBLE_WINDOW_MINUTES = Number(
  process.env.OPERATOR_PASSENGER_VISIBLE_WINDOW_MINUTES || '60'
);

type ReservationIndexRow = {
  id: string;
  full_name: string | null;
  contact_number: string | null;
  pickup_location: string | null;
  route: string | null;
  seat_count: number | null;
  amount_due: number | null;
  status: string | null;
  created_at: string | null;
  paid_at: string | null;
  queue_id: string | null;
  trip_key: string | null;
};

const toTimestamp = (value?: string | null) => {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const toTimeLabel = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const toPositiveInt = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized <= 0) return fallback;
  return normalized;
};

const normalizeRoute = (value?: string | null) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ');

const toTitleRoute = (value?: string | null) => {
  const normalized = normalizeRoute(value).toLowerCase();
  if (!normalized) return '';
  return normalized
    .split(' ')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
};

const splitRouteParts = (value?: string | null) => {
  const normalized = normalizeRoute(value)
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!normalized) return [] as string[];

  return normalized
    .split(/\bto\b|->|—|-/i)
    .map((part) => part.trim())
    .filter(Boolean);
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
    const requestedPage = toPositiveInt(req.nextUrl.searchParams.get('page'), 1);
    const requestedPageSize = toPositiveInt(
      req.nextUrl.searchParams.get('pageSize'),
      DEFAULT_PAGE_SIZE
    );
    const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
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

    const queueStatusRank = (status?: string | null) => {
      const normalized = String(status || '').toLowerCase();
      if (normalized === 'departed') return 0;
      if (normalized === 'boarding') return 1;
      if (normalized === 'queued') return 2;
      return 3;
    };

    const prioritizedQueues = [...(queueRows || [])].sort((a, b) => {
      const rankA = queueStatusRank(a.status);
      const rankB = queueStatusRank(b.status);
      if (rankA !== rankB) return rankA - rankB;

      const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
      const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    if (prioritizedQueues.length === 0) {
      return NextResponse.json({
        queue: null,
        passengers: [],
        pagination: {
          page: 1,
          pageSize,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
        activeTripKey: null,
      });
    }

    const todayTripDate = new Date().toISOString().slice(0, 10);
    const queueCandidates = prioritizedQueues.map((queue) => {
      const departureLabel = toTimeLabel(queue.departure_time || null);
      const departureDate = queue.departure_time
        ? new Date(queue.departure_time)
        : null;
      const departureTripDate =
        departureDate && !Number.isNaN(departureDate.getTime())
          ? departureDate.toISOString().slice(0, 10)
          : '';

      const normalizedRoute = normalizeRoute(queue.route);
      const routeVariants = normalizedRoute
        ? Array.from(
            new Set([
              normalizedRoute,
              normalizedRoute.toLowerCase(),
              toTitleRoute(normalizedRoute),
            ].filter(Boolean))
          )
        : [];
      const tripDates = [todayTripDate, departureTripDate].filter(Boolean);
      const tripKeyCandidates =
        routeVariants.length > 0 && departureLabel
          ? Array.from(
              new Set(
                routeVariants.flatMap((routeVariant) =>
                  tripDates.map(
                    (tripDate) => `${routeVariant}|${departureLabel}|${tripDate}`
                  )
                )
              )
            )
          : [];

      return {
        queue,
        tripKeyCandidates,
        tripKeySet: new Set(tripKeyCandidates.map((value) => String(value || '').trim())),
        activeTripKey: tripKeyCandidates[0] || null,
      };
    });

    const { data: reservationIndexRows, error: reservationIndexError } =
      await serviceClient
        .from('tbl_reservations')
        .select(
          'id, full_name, contact_number, pickup_location, route, seat_count, amount_due, status, created_at, paid_at, queue_id, trip_key'
        )
        .eq('operator_user_id', user.id)
        .in('status', pickupEligibleStatuses)
        .order('updated_at', { ascending: false })
        .limit(RESERVATION_INDEX_LIMIT);

    if (reservationIndexError) {
      return NextResponse.json(
        { error: reservationIndexError.message || 'Failed to load passengers.' },
        { status: 500 }
      );
    }

    const visibilityCutoffMs =
      Date.now() - PASSENGER_VISIBLE_WINDOW_MINUTES * 60 * 1000;
    const recentReservationRows = ((reservationIndexRows || []) as ReservationIndexRow[])
      .filter((row) => {
        const paidAtMs = toTimestamp(row.paid_at);
        const createdAtMs = toTimestamp(row.created_at);
        const effectiveMs = paidAtMs || createdAtMs;
        return effectiveMs >= visibilityCutoffMs;
      });

    const routeMatchesCandidate = (
      rowRoute: string | null | undefined,
      candidateRoute: string | null | undefined
    ) => {
      const left = normalizeRoute(rowRoute).toLowerCase();
      const right = normalizeRoute(candidateRoute).toLowerCase();
      if (!left || !right) return false;
      if (left === right) return true;
      if (left.includes(right) || right.includes(left)) return true;

      const leftParts = splitRouteParts(left);
      const rightParts = splitRouteParts(right);
      const leftLast = leftParts[leftParts.length - 1] || '';
      const rightLast = rightParts[rightParts.length - 1] || '';

      if (leftLast && rightLast && leftLast === rightLast) return true;
      if (leftLast && right && (leftLast === right || right.includes(leftLast))) {
        return true;
      }
      if (rightLast && left && (rightLast === left || left.includes(rightLast))) {
        return true;
      }

      return false;
    };

    const rowMatchesCandidate = (
      row: ReservationIndexRow,
      candidate: (typeof queueCandidates)[number],
      options?: { skipTripKey?: boolean }
    ) => {
      const rowQueueId = String(row.queue_id || '').trim();
      const candidateQueueId = String(candidate.queue.id || '').trim();
      if (rowQueueId && candidateQueueId && rowQueueId === candidateQueueId) {
        return true;
      }

      const rowTripKey = String(row.trip_key || '').trim();
      if (!options?.skipTripKey && rowTripKey && candidate.tripKeyCandidates.length > 0) {
        if (candidate.tripKeySet.has(rowTripKey)) {
          return true;
        }
      }

      return routeMatchesCandidate(row.route, candidate.queue.route);
    };

    const countCandidateReservations = (
      candidate: (typeof queueCandidates)[number],
      options?: { skipTripKey?: boolean }
    ) => {
      let count = 0;
      for (const row of recentReservationRows) {
        if (rowMatchesCandidate(row, candidate, options)) {
          count += 1;
        }
      }
      return count;
    };

    const filterCandidateReservations = (
      candidate: (typeof queueCandidates)[number],
      options?: { skipTripKey?: boolean }
    ) => {
      return recentReservationRows.filter((row) =>
        rowMatchesCandidate(row, candidate, options)
      );
    };

    let selectedCandidate = queueCandidates[0];
    let preloadedTotal = 0;
    let tripKeyFilterSkipped = false;

    for (const candidate of queueCandidates) {
      const candidateTotal = countCandidateReservations(candidate);
      if (candidateTotal > 0) {
        selectedCandidate = candidate;
        preloadedTotal = candidateTotal;
        break;
      }
    }

    // Fallback: if no strict trip_key match, show same queue/status passengers.
    // This prevents blank Passenger tab when route text casing differs in trip_key.
    if (preloadedTotal === 0) {
      for (const candidate of queueCandidates) {
        const candidateTotal = countCandidateReservations(candidate, {
          skipTripKey: true,
        });
        if (candidateTotal > 0) {
          selectedCandidate = candidate;
          preloadedTotal = candidateTotal;
          tripKeyFilterSkipped = true;
          break;
        }
      }
    }

    const currentQueue = selectedCandidate.queue;
    const activeTripKey = tripKeyFilterSkipped
      ? null
      : selectedCandidate.activeTripKey;
    const filteredRows = filterCandidateReservations(selectedCandidate, {
      skipTripKey: tripKeyFilterSkipped,
    }).sort(
      (a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at)
    );

    const total = Math.max(0, filteredRows.length);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    let page = requestedPage;

    if (page > totalPages) {
      page = totalPages;
    }
    const from = Math.max(0, (page - 1) * pageSize);
    const to = from + pageSize;
    const reservationRows = filteredRows.slice(from, to);

    return NextResponse.json({
      queue: {
        id: currentQueue.id,
        route: currentQueue.route || '',
        plate_number: currentQueue.plate_number || '',
        departure_time: currentQueue.departure_time || null,
        status: currentQueue.status || 'boarding',
      },
      passengers: reservationRows || [],
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      activeTripKey,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unexpected server error.' },
      { status: 500 }
    );
  }
}
