import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const activeQueueStatuses = ['boarding', 'queued'];
const pickupEligibleStatuses = ['confirmed', 'paid'];
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

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

    const prioritizedQueues = [...(queueRows || [])].sort((a, b) => {
      const rankA = a.status === 'boarding' ? 0 : 1;
      const rankB = b.status === 'boarding' ? 0 : 1;
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
        activeTripKey: tripKeyCandidates[0] || null,
      };
    });

    const applyReservationFilters = (
      query: any,
      candidate: (typeof queueCandidates)[number],
      options?: { skipTripKey?: boolean }
    ) => {
      let next = query
        .eq('operator_user_id', user.id)
        .eq('queue_id', candidate.queue.id)
        .in('status', pickupEligibleStatuses);

      if (!options?.skipTripKey) {
        if (candidate.tripKeyCandidates.length === 1) {
          next = next.eq('trip_key', candidate.tripKeyCandidates[0]);
        } else if (candidate.tripKeyCandidates.length > 1) {
          next = next.in('trip_key', candidate.tripKeyCandidates);
        }
      }
      return next;
    };

    let selectedCandidate = queueCandidates[0];
    let preloadedTotal = 0;
    let tripKeyFilterSkipped = false;
    for (const candidate of queueCandidates) {
      const { count, error } = await applyReservationFilters(
        serviceClient.from('tbl_reservations').select('id', {
          count: 'exact',
          head: true,
        }),
        candidate
      );
      if (error) {
        return NextResponse.json(
          { error: error.message || 'Failed to load passengers.' },
          { status: 500 }
        );
      }
      const candidateTotal = Number(count || 0);
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
        const { count, error } = await applyReservationFilters(
          serviceClient.from('tbl_reservations').select('id', {
            count: 'exact',
            head: true,
          }),
          candidate,
          { skipTripKey: true }
        );
        if (error) {
          return NextResponse.json(
            { error: error.message || 'Failed to load passengers.' },
            { status: 500 }
          );
        }
        const candidateTotal = Number(count || 0);
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

    const fetchPassengerPage = async (page: number) => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const query = applyReservationFilters(
        serviceClient
          .from('tbl_reservations')
        .select(
          'id, full_name, contact_number, pickup_location, route, seat_count, amount_due, status, created_at, paid_at',
          { count: 'exact' }
        ),
        selectedCandidate,
        { skipTripKey: tripKeyFilterSkipped }
      );

      return query
        .order('created_at', { ascending: false })
        .range(from, to);
    };

    let page = requestedPage;
    const firstPageResult = await fetchPassengerPage(page);
    let reservationRows = firstPageResult.data;
    let reservationError = firstPageResult.error;

    if (reservationError) {
      return NextResponse.json(
        { error: reservationError.message || 'Failed to load passengers.' },
        { status: 500 }
      );
    }

    const total = Math.max(preloadedTotal, Number(firstPageResult.count || 0));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    if (total > 0 && page > totalPages) {
      page = totalPages;
      const retry = await fetchPassengerPage(page);
      reservationRows = retry.data;
      reservationError = retry.error;
      if (reservationError) {
        return NextResponse.json(
          { error: reservationError.message || 'Failed to load passengers.' },
          { status: 500 }
        );
      }
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
