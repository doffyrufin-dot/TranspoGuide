'use client';

export type RouteFareRow = {
  id: string;
  origin: string;
  destination: string;
  vehicle_type: string;
  vehicle_image_url?: string | null;
  regular_fare: number;
  discount_rate: number;
  distance_km: number | null;
  source?: 'route_fare' | 'barangay_fare';
};

export type AppliedFilters = {
  vehicle: string;
  origin: string;
  destination: string;
};

export type RouteMetric = {
  origin: string;
  destination: string;
  vehicle_type: string;
  distance_km: number;
  duration_minutes: number;
  provider: string;
};

export type RouteMetricsResponse = {
  metrics: RouteMetric[];
};

export type RouteMetricPayload = {
  origin: string;
  destination: string;
  vehicle_type: string;
  distance_km?: number | null;
  regular_fare?: number | null;
  travel_time_minutes?: number | null;
};

const ROUTE_FARES_CACHE_TTL_MS = 45 * 1000;
const ROUTE_METRICS_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedRouteFares = {
  expiresAt: number;
  data: { rows: RouteFareRow[] };
};

type CachedRouteMetrics = {
  expiresAt: number;
  data: RouteMetricsResponse;
};

const routeFaresCache = new Map<string, CachedRouteFares>();
const routeFaresInflight = new Map<string, Promise<{ rows: RouteFareRow[] }>>();
const routeMetricsCache = new Map<string, CachedRouteMetrics>();

const routeMetricsCacheKey = (routes: RouteMetricPayload[]) =>
  routes
    .map((route) => ({
      origin: String(route.origin || '').trim().toLowerCase(),
      destination: String(route.destination || '').trim().toLowerCase(),
      vehicle_type: String(route.vehicle_type || '').trim().toLowerCase(),
      distance_km: Number(route.distance_km || 0),
    }))
    .sort((a, b) =>
      `${a.origin}|${a.destination}|${a.vehicle_type}`.localeCompare(
        `${b.origin}|${b.destination}|${b.vehicle_type}`
      )
    )
    .map((route) =>
      `${route.origin}|${route.destination}|${route.vehicle_type}|${route.distance_km}`
    )
    .join('||');

export const fetchRouteFares = async (url: string) => {
  const now = Date.now();
  const cached = routeFaresCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const inflight = routeFaresInflight.get(url);
  if (inflight) return inflight;

  const request = (async () => {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to fetch route fares.');
    }
    const payload = data as { rows: RouteFareRow[] };
    routeFaresCache.set(url, {
      data: payload,
      expiresAt: Date.now() + ROUTE_FARES_CACHE_TTL_MS,
    });
    return payload;
  })();

  routeFaresInflight.set(url, request);
  try {
    return await request;
  } finally {
    routeFaresInflight.delete(url);
  }
};

export const fetchRouteMetrics = async (
  routes: RouteMetricPayload[],
  signal?: AbortSignal
) => {
  const cacheKey = routeMetricsCacheKey(routes);
  const cached = routeMetricsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const res = await fetch('/api/public/route-metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ routes }),
    signal,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to fetch route metrics.');
  }

  const payload = data as RouteMetricsResponse;
  if (routes.length <= 12) {
    routeMetricsCache.set(cacheKey, {
      data: payload,
      expiresAt: Date.now() + ROUTE_METRICS_CACHE_TTL_MS,
    });
  }
  return payload;
};

export const normalizeRouteKey = (
  origin: string,
  destination: string,
  vehicleType: string
) =>
  `${origin}`.trim().toLowerCase() +
  '|' +
  `${destination}`.trim().toLowerCase() +
  '|' +
  `${vehicleType}`.trim().toLowerCase();

const normalizeText = (value: string) =>
  value.replace(/\s+/g, ' ').trim().toLowerCase();

const matchesFilter = (candidate: string, filter: string) => {
  const normalizedFilter = normalizeText(filter);
  if (!normalizedFilter) return true;
  return normalizeText(candidate) === normalizedFilter;
};

export const filterRowsByInputs = (
  rows: RouteFareRow[],
  vehicle: string,
  origin: string,
  destination: string
) => {
  const normalizedOrigin = normalizeText(origin);
  const normalizedDestination = normalizeText(destination);

  return rows.filter((r) => {
    const vehicleOk = vehicle === 'all' || r.vehicle_type === vehicle;
    const originOk = matchesFilter(r.origin, origin);
    const destinationOk = matchesFilter(r.destination, destination);
    if (vehicleOk && originOk && destinationOk) return true;

    // Allow reverse lookup only for barangay fares:
    // e.g. Origin=Matlang, Destination=Isabel should match
    // stored row Origin=Isabel, Destination=Matlang.
    if (!vehicleOk) return false;
    if (r.source !== 'barangay_fare') return false;
    if (!normalizedOrigin) return false;
    if (
      normalizedDestination &&
      normalizeText(r.origin) !== normalizedDestination
    ) {
      return false;
    }
    return normalizeText(r.destination) === normalizedOrigin;
  });
};

export const sortRowsForDisplay = (
  rows: RouteFareRow[],
  selectedDestination: string
) => {
  const list = [...rows];
  const normalizedDestination = selectedDestination.trim().toLowerCase();
  if (!normalizedDestination) return list;

  const hasBarangaySelected = list.some(
    (r) =>
      r.source === 'barangay_fare' &&
      r.destination.toLowerCase() === normalizedDestination
  );
  if (!hasBarangaySelected) return list;

  return list.sort((a, b) => {
    const aIsPriority =
      a.source === 'barangay_fare' &&
      a.vehicle_type.toLowerCase().includes('trycicle');
    const bIsPriority =
      b.source === 'barangay_fare' &&
      b.vehicle_type.toLowerCase().includes('trycicle');
    if (aIsPriority && !bIsPriority) return -1;
    if (!aIsPriority && bIsPriority) return 1;
    return a.vehicle_type.localeCompare(b.vehicle_type);
  });
};

export const imageForVehicle = (label: string) => {
  const key = (label || '').toLowerCase();
  if (key.includes('mini')) return '/vehicle/minibus.jpg';
  if (key.includes('bus')) return '/vehicle/bus.jpg';
  if (key.includes('van')) return '/vehicle/van.jpg';
  if (key.includes('jeep')) return '/vehicle/jeep.png';
  if (key.includes('multi')) return '/vehicle/multicab.jpg';
  if (key.includes('trycicle') || key.includes('tricycle'))
    return '/vehicle/trycicle.jpg';
  return '/vehicle/van.jpg';
};

export const getAverageSpeedKph = (label: string) => {
  const key = (label || '').toLowerCase();
  if (key.includes('bus')) return 45;
  if (key.includes('mini')) return 40;
  if (key.includes('van')) return 50;
  if (key.includes('jeep')) return 35;
  if (key.includes('multi')) return 32;
  if (key.includes('trycicle') || key.includes('tricycle')) return 25;
  return 35;
};

const inferDistanceKmFromFare = (row: RouteFareRow) => {
  const vehicleKey = (row.vehicle_type || '').toLowerCase();
  const fare = Number(row.regular_fare || 0);
  if (fare <= 0) return 0;

  if (vehicleKey.includes('trycicle') || vehicleKey.includes('tricycle')) {
    const inferred = (fare - 15) / 2;
    return Number.isFinite(inferred) ? Math.max(1, inferred) : 0;
  }

  const farePerKmMap: Record<string, number> = {
    bus: 3.2,
    minibus: 3.4,
    van: 3.8,
    jeep: 2.8,
    multicab: 2.6,
  };

  const matchedKey = Object.keys(farePerKmMap).find((k) =>
    vehicleKey.includes(k)
  );
  if (!matchedKey) return 0;
  return fare / farePerKmMap[matchedKey];
};

export const getDistanceKm = (row: RouteFareRow) => {
  if (row.distance_km != null && Number(row.distance_km) > 0) {
    return Number(row.distance_km);
  }
  return inferDistanceKmFromFare(row);
};

export const formatTravelTime = (totalMinutes: number) => {
  const safe = Math.max(1, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours <= 0) return `${mins} min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};
