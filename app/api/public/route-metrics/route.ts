import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type RouteMetricInput = {
  origin: string;
  destination: string;
  vehicle_type: string;
  distance_km?: number | null;
  regular_fare?: number | null;
  travel_time_minutes?: number | null;
};

type CachedMetricRow = {
  origin: string;
  destination: string;
  vehicle_type: string;
  distance_km: number;
  duration_minutes: number;
  provider: string;
  updated_at: string;
};

type ComputedMetric = {
  distance_km: number;
  duration_minutes: number;
  provider: string;
};

const MAX_ROUTES_PER_REQUEST = 25;
const DEFAULT_CACHE_HOURS = 24;

const normalizeLocation = (value: string) => `${value}`.trim().replace(/\s+/g, ' ');

const normalizeRoute = (row: RouteMetricInput): RouteMetricInput => ({
  origin: normalizeLocation(row.origin),
  destination: normalizeLocation(row.destination),
  vehicle_type: normalizeLocation(row.vehicle_type),
  distance_km: row.distance_km == null ? null : Number(row.distance_km),
  regular_fare: row.regular_fare == null ? null : Number(row.regular_fare),
  travel_time_minutes: row.travel_time_minutes == null ? null : Number(row.travel_time_minutes),
});

const normalizeKey = (origin: string, destination: string, vehicleType: string) =>
  `${origin}`.trim().toLowerCase() +
  '|' +
  `${destination}`.trim().toLowerCase() +
  '|' +
  `${vehicleType}`.trim().toLowerCase();

const isFresh = (updatedAt: string, cacheHours: number) => {
  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= cacheHours * 60 * 60 * 1000;
};

const getAverageSpeedKph = (vehicleType: string) => {
  const key = (vehicleType || '').toLowerCase();
  if (key.includes('bus')) return 45;
  if (key.includes('mini')) return 40;
  if (key.includes('van')) return 50;
  if (key.includes('jeep')) return 35;
  if (key.includes('multi')) return 32;
  if (key.includes('tricycle')) return 25;
  return 35;
};

const inferDistanceFromFare = (vehicleType: string, regularFare: number) => {
  const key = (vehicleType || '').toLowerCase();
  const fare = Number(regularFare || 0);
  if (fare <= 0) return 0;

  if (key.includes('tricycle')) {
    // Barangay formula in setup: base 15 + 2 per km
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
  const matched = Object.keys(farePerKmMap).find((k) => key.includes(k));
  if (!matched) return 0;
  return fare / farePerKmMap[matched];
};

const computeMetric = (route: RouteMetricInput): ComputedMetric | null => {
  const knownDistance = Number(route.distance_km || 0);
  const inferredDistance = inferDistanceFromFare(route.vehicle_type, Number(route.regular_fare || 0));
  const distanceKm = knownDistance > 0 ? knownDistance : inferredDistance;
  if (!distanceKm || distanceKm <= 0) return null;

  const manualDuration = Number(route.travel_time_minutes || 0);
  const durationMinutes =
    manualDuration > 0
      ? Math.max(1, Math.round(manualDuration))
      : Math.max(1, Math.round((distanceKm / getAverageSpeedKph(route.vehicle_type)) * 60));

  return {
    distance_km: Number(distanceKm.toFixed(2)),
    duration_minutes: durationMinutes,
    provider: manualDuration > 0 ? 'admin_manual' : 'local_formula',
  };
};

const getCachedMetric = async (supabase: any, route: RouteMetricInput): Promise<CachedMetricRow | null> => {
  const { data, error } = await (supabase as any)
    .from('tbl_route_metrics_cache')
    .select('origin, destination, vehicle_type, distance_km, duration_minutes, provider, updated_at')
    .eq('origin', route.origin)
    .eq('destination', route.destination)
    .eq('vehicle_type', route.vehicle_type)
    .maybeSingle();

  if (error) {
    // Cache table missing or no-access: fail soft and continue with direct computation.
    if (error.code === '42P01' || error.code === 'PGRST205') return null;
    return null;
  }

  return (data as CachedMetricRow | null) || null;
};

const upsertCachedMetric = async (supabase: any, route: RouteMetricInput, metric: ComputedMetric) => {
  const payload = {
    origin: route.origin,
    destination: route.destination,
    vehicle_type: route.vehicle_type,
    distance_km: metric.distance_km,
    duration_minutes: metric.duration_minutes,
    provider: metric.provider,
  };

  await (supabase as any)
    .from('tbl_route_metrics_cache')
    .upsert(payload, { onConflict: 'origin,destination,vehicle_type' });
};

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'server_env_missing' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const inputRoutes = Array.isArray(body?.routes) ? body.routes : [];
    if (inputRoutes.length === 0) {
      return NextResponse.json({ metrics: [] });
    }
    if (inputRoutes.length > MAX_ROUTES_PER_REQUEST) {
      return NextResponse.json({ error: 'too_many_routes' }, { status: 400 });
    }

    const routes: RouteMetricInput[] = inputRoutes
      .map((row: any) => ({
        origin: `${row?.origin || ''}`,
        destination: `${row?.destination || ''}`,
        vehicle_type: `${row?.vehicle_type || ''}`,
        distance_km: row?.distance_km == null ? null : Number(row.distance_km),
        regular_fare: row?.regular_fare == null ? null : Number(row.regular_fare),
        travel_time_minutes:
          row?.travel_time_minutes == null ? null : Number(row.travel_time_minutes),
      }))
      .filter((row: RouteMetricInput) => row.origin.trim() && row.destination.trim() && row.vehicle_type.trim())
      .map(normalizeRoute);

    if (routes.length === 0) {
      return NextResponse.json({ metrics: [] });
    }

    const cacheHours = Number(process.env.ROUTE_METRICS_CACHE_HOURS || DEFAULT_CACHE_HOURS);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const metrics: Array<{
      origin: string;
      destination: string;
      vehicle_type: string;
      distance_km: number;
      duration_minutes: number;
      provider: string;
    }> = [];
    const inRequestMap = new Map<string, ComputedMetric>();

    for (const route of routes) {
      const hasManualOverride = Number(route.travel_time_minutes || 0) > 0;
      if (hasManualOverride) {
        const computed = computeMetric(route);
        if (!computed) continue;
        metrics.push({
          origin: route.origin,
          destination: route.destination,
          vehicle_type: route.vehicle_type,
          distance_km: computed.distance_km,
          duration_minutes: computed.duration_minutes,
          provider: computed.provider,
        });
        await upsertCachedMetric(supabase, route, computed);
        continue;
      }

      const cached = await getCachedMetric(supabase, route);
      if (cached && isFresh(cached.updated_at, cacheHours)) {
        metrics.push({
          origin: route.origin,
          destination: route.destination,
          vehicle_type: route.vehicle_type,
          distance_km: Number(cached.distance_km),
          duration_minutes: Number(cached.duration_minutes),
          provider: cached.provider || 'cache',
        });
        continue;
      }

      const key = normalizeKey(route.origin, route.destination, route.vehicle_type);
      const fromBatch = inRequestMap.get(key);
      const computed = fromBatch || computeMetric(route);
      if (!computed) continue;
      if (!fromBatch) inRequestMap.set(key, computed);

      metrics.push({
        origin: route.origin,
        destination: route.destination,
        vehicle_type: route.vehicle_type,
        distance_km: computed.distance_km,
        duration_minutes: computed.duration_minutes,
        provider: computed.provider,
      });

      await upsertCachedMetric(supabase, route, computed);
    }

    return NextResponse.json({ metrics });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch route metrics.' },
      { status: 500 }
    );
  }
}
