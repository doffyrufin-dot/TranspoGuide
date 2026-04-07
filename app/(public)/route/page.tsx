'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  FaArrowRight,
  FaBus,
  FaChevronDown,
  FaClock,
  FaExchangeAlt,
  FaMapMarkerAlt,
  FaMotorcycle,
  FaSearch,
  FaShuttleVan,
  FaTaxi,
} from 'react-icons/fa';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/motion';

type RouteFareRow = {
  id: string;
  origin: string;
  destination: string;
  vehicle_type: string;
  regular_fare: number;
  discount_rate: number;
  distance_km: number | null;
  source?: 'route_fare' | 'barangay_fare';
};

type AppliedFilters = {
  vehicle: string;
  origin: string;
  destination: string;
};

type RouteMetric = {
  origin: string;
  destination: string;
  vehicle_type: string;
  distance_km: number;
  duration_minutes: number;
  provider: string;
};

type RouteMetricsResponse = {
  metrics: RouteMetric[];
};

const fetchRouteFares = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to fetch route fares.');
  }
  return data as { rows: RouteFareRow[] };
};

const fetchRouteMetrics = async (
  routes: Array<{ origin: string; destination: string; vehicle_type: string }>
) => {
  const res = await fetch('/api/public/route-metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ routes }),
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to fetch route metrics.');
  }
  return data as RouteMetricsResponse;
};

const normalizeRouteKey = (
  origin: string,
  destination: string,
  vehicleType: string
) =>
  `${origin}`.trim().toLowerCase() +
  '|' +
  `${destination}`.trim().toLowerCase() +
  '|' +
  `${vehicleType}`.trim().toLowerCase();

const filterRowsByInputs = (
  rows: RouteFareRow[],
  vehicle: string,
  origin: string,
  destination: string
) => {
  return rows.filter((r) => {
    const vehicleOk = vehicle === 'all' || r.vehicle_type === vehicle;
    const originOk =
      !origin.trim() ||
      r.origin.toLowerCase().includes(origin.trim().toLowerCase());
    const destinationOk =
      !destination.trim() ||
      r.destination.toLowerCase().includes(destination.trim().toLowerCase());
    return vehicleOk && originOk && destinationOk;
  });
};

const iconForVehicle = (label: string) => {
  const key = (label || '').toLowerCase();
  if (key.includes('bus')) return <FaBus />;
  if (
    key.includes('van') ||
    key.includes('mini') ||
    key.includes('jeep') ||
    key.includes('multi')
  )
    return <FaShuttleVan />;
  if (key.includes('trycicle') || key.includes('tricycle')) return <FaTaxi />;
  if (key.includes('habal')) return <FaMotorcycle />;
  return <FaShuttleVan />;
};

const imageForVehicle = (label: string) => {
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

const getAverageSpeedKph = (label: string) => {
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
    // Barangay tricycle rule used in setup: base 15 + 2 per km
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

const getDistanceKm = (row: RouteFareRow) => {
  if (row.distance_km != null && Number(row.distance_km) > 0) {
    return Number(row.distance_km);
  }
  return inferDistanceKmFromFare(row);
};

const formatTravelTime = (totalMinutes: number) => {
  const safe = Math.max(1, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours <= 0) return `${mins} min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

const RoutePage = () => {
  const [vehicle, setVehicle] = useState('all');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [rows, setRows] = useState<RouteFareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters | null>(
    null
  );
  const [metricsByKey, setMetricsByKey] = useState<Record<string, RouteMetric>>(
    {}
  );
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setLoadError('');
        const data = await fetchRouteFares('/api/public/routes-fares');
        if (cancelled) return;
        setRows(data.rows || []);
      } catch (error: any) {
        if (cancelled) return;
        setLoadError(error?.message || 'Failed to load routes and fares.');
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const vehicleTypes = useMemo(() => {
    const uniq = Array.from(
      new Set(rows.map((r) => r.vehicle_type).filter(Boolean))
    );
    return uniq.sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const origins = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.origin).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [rows]
  );
  const destinations = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.destination).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [rows]
  );

  const filteredRows = useMemo(() => {
    if (!appliedFilters) return [];
    return filterRowsByInputs(
      rows,
      appliedFilters.vehicle,
      appliedFilters.origin,
      appliedFilters.destination
    );
  }, [rows, appliedFilters]);

  const displayRows = useMemo(() => {
    const list = [...filteredRows];
    const selectedDestination = (appliedFilters?.destination || '')
      .trim()
      .toLowerCase();
    if (!selectedDestination) return list;

    const hasBarangaySelected = list.some(
      (r) =>
        r.source === 'barangay_fare' &&
        r.destination.toLowerCase() === selectedDestination
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
  }, [filteredRows, appliedFilters]);

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const handleSearch = async () => {
    const nextFilters: AppliedFilters = { vehicle, origin, destination };
    setAppliedFilters(nextFilters);

    const selectedRows = filterRowsByInputs(rows, vehicle, origin, destination);
    if (selectedRows.length === 0) {
      setMetricsByKey({});
      return;
    }

    const payloadRoutes = selectedRows.map((r) => ({
      origin: r.origin,
      destination: r.destination,
      vehicle_type: r.vehicle_type,
      distance_km: r.distance_km,
      regular_fare: r.regular_fare,
    }));

    try {
      setMetricsLoading(true);
      const data = await fetchRouteMetrics(payloadRoutes);
      const nextMap: Record<string, RouteMetric> = {};
      (data.metrics || []).forEach((m) => {
        nextMap[normalizeRouteKey(m.origin, m.destination, m.vehicle_type)] = m;
      });
      setMetricsByKey(nextMap);
    } catch {
      setMetricsByKey({});
    } finally {
      setMetricsLoading(false);
    }
  };

  return (
    <main>
      <section className="relative pt-36 pb-20 px-6">
        <FadeIn className="max-w-4xl mx-auto text-center">
          <div className="section-badge mx-auto mb-5">Route Finder</div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-theme leading-tight">
            Find Your{' '}
            <span className="text-gradient" style={{ fontStyle: 'italic' }}>
              Fastest Route
            </span>
          </h1>
          <p className="mt-4 text-muted-theme text-lg max-w-xl mx-auto">
            Search routes and compare fares using your admin-configured route
            matrix.
          </p>
        </FadeIn>

        <FadeIn className="max-w-3xl mx-auto mt-10" delay={0.08}>
          <div className="card-glow p-6 md:p-8 rounded-2xl">
            <div className="flex flex-wrap gap-2 mb-6">
              <button
                onClick={() => setVehicle('all')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${vehicle === 'all' ? 'btn-primary shadow-none py-1.5 px-4' : ''}`}
                style={
                  vehicle !== 'all'
                    ? {
                        background: 'var(--tg-subtle)',
                        border: '1px solid var(--tg-border-primary)',
                        color: 'var(--primary)',
                      }
                    : {}
                }
              >
                All Types
              </button>
              {vehicleTypes.map((label) => (
                <button
                  key={label}
                  onClick={() => setVehicle(label)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 transition-all cursor-pointer ${vehicle === label ? 'btn-primary shadow-none py-1.5 px-4' : ''}`}
                  style={
                    vehicle !== label
                      ? {
                          background: 'var(--tg-subtle)',
                          border: '1px solid var(--tg-border-primary)',
                          color: 'var(--primary)',
                        }
                      : {}
                  }
                >
                  <span className="text-xs">{iconForVehicle(label)}</span>
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-center">
              <div className="relative">
                <div className="input-dark pl-3 pr-9 flex items-center gap-2">
                  <FaMapMarkerAlt
                    className="text-sm shrink-0"
                    style={{ color: 'var(--primary)' }}
                  />
                  <select
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    className="w-full bg-transparent outline-none border-0 text-theme appearance-none"
                    style={
                      {
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                      } as React.CSSProperties
                    }
                  >
                    <option
                      value=""
                      className="bg-white dark:bg-gray-800 text-black dark:text-white"
                    >
                      All Origins
                    </option>
                    {origins.map((o) => (
                      <option
                        className="bg-white dark:bg-gray-800 text-black dark:text-white"
                        key={o}
                        value={o}
                      >
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <FaChevronDown
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                  style={{ color: 'var(--tg-muted)' }}
                />
              </div>
              <button
                onClick={swap}
                className="theme-toggle mx-auto"
                title="Swap"
                style={{ color: 'var(--primary)' }}
              >
                <FaExchangeAlt size={13} />
              </button>
              <div className="relative">
                <div className="input-dark pl-3 pr-9 flex items-center gap-2">
                  <FaMapMarkerAlt
                    className="text-sm shrink-0"
                    style={{ color: 'var(--primary)' }}
                  />
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="w-full bg-transparent outline-none border-0 text-theme appearance-none"
                    style={
                      {
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                      } as React.CSSProperties
                    }
                  >
                    <option
                      value=""
                      className="bg-white dark:bg-gray-800 text-black dark:text-white"
                    >
                      All Destinations
                    </option>
                    {destinations.map((d) => (
                      <option
                        className="bg-white dark:bg-gray-800 text-black dark:text-white"
                        key={d}
                        value={d}
                      >
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <FaChevronDown
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                  style={{ color: 'var(--tg-muted)' }}
                />
              </div>
            </div>

            <button
              className="btn-primary w-full text-base mt-5 group"
              type="button"
              onClick={handleSearch}
            >
              <FaSearch size={14} /> Search Routes{' '}
              <FaArrowRight
                size={13}
                className="ml-auto group-hover:translate-x-1 transition-transform"
              />
            </button>
          </div>
        </FadeIn>
      </section>

      {appliedFilters && (
        <section className="px-6 pb-28">
          <div className="max-w-5xl mx-auto">
            {loading ? (
              <div className="card-glow rounded-2xl p-10 text-center text-muted-theme text-sm">
                Loading route results...
              </div>
            ) : loadError ? (
              <div className="card-glow rounded-2xl p-10 text-center text-sm text-theme">
                {loadError}
              </div>
            ) : displayRows.length === 0 ? (
              <div className="card-glow rounded-2xl p-10 text-center text-muted-theme text-sm">
                No routes found for your current filters.
              </div>
            ) : (
              <div className="space-y-3">
                {metricsLoading && (
                  <div className="text-xs text-muted-theme">
                    Fetching latest distance and travel time...
                  </div>
                )}
                <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {displayRows.map((r) => {
                    const discounted = r.regular_fare * (1 - r.discount_rate);
                    const savings = r.regular_fare - discounted;
                    const key = normalizeRouteKey(
                      r.origin,
                      r.destination,
                      r.vehicle_type
                    );
                    const metric = metricsByKey[key];
                    const distanceKm = metric?.distance_km ?? getDistanceKm(r);
                    const estimatedMinutes =
                      metric?.duration_minutes ??
                      (distanceKm > 0
                        ? (distanceKm / getAverageSpeedKph(r.vehicle_type)) * 60
                        : 0);
                    return (
                      <StaggerItem key={r.id}>
                        <div
                          className="rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-1"
                          style={{
                            background: 'var(--tg-bg-alt)',
                            border: '1px solid var(--tg-border)',
                            boxShadow: 'var(--tg-shadow)',
                          }}
                        >
                          <div
                            className="h-40 w-full"
                            style={{ background: 'var(--tg-subtle)' }}
                          >
                            <img
                              src={imageForVehicle(r.vehicle_type)}
                              alt={r.vehicle_type}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          <div className="p-4 md:p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-theme font-bold text-xl">
                                  {r.vehicle_type}
                                </p>
                                <p className="text-muted-theme text-sm mt-1">
                                  {r.origin} to {r.destination}
                                </p>
                              </div>
                              <span
                                className="text-sm"
                                style={{ color: 'var(--primary)' }}
                              >
                                {iconForVehicle(r.vehicle_type)}
                              </span>
                            </div>

                            <div className="mt-4 space-y-1">
                              <p className="text-muted-theme text-sm">
                                Regular:{' '}
                                <span className="text-theme font-semibold">
                                  P{r.regular_fare.toFixed(2)}
                                </span>
                              </p>
                              <p className="text-muted-theme text-sm">
                                Discounted:{' '}
                                <span
                                  style={{ color: 'var(--primary)' }}
                                  className="font-bold"
                                >
                                  P{discounted.toFixed(2)}
                                </span>
                              </p>
                              <p className="text-muted-theme text-sm">
                                You save:{' '}
                                <span className="text-theme font-semibold">
                                  P{savings.toFixed(2)}
                                </span>
                              </p>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2">
                              <div
                                className="rounded-lg px-3 py-2 text-xs"
                                style={{
                                  background: 'var(--tg-subtle)',
                                  border: '1px solid var(--tg-border)',
                                }}
                              >
                                <p className="text-muted-theme">Distance</p>
                                <p className="text-theme font-semibold">
                                  {distanceKm > 0
                                    ? `${distanceKm.toFixed(1)} km`
                                    : '--'}
                                </p>
                              </div>
                              <div
                                className="rounded-lg px-3 py-2 text-xs"
                                style={{
                                  background: 'var(--tg-subtle)',
                                  border: '1px solid var(--tg-border)',
                                }}
                              >
                                <p className="text-muted-theme flex items-center gap-1">
                                  <FaClock size={10} /> Travel Time
                                </p>
                                <p className="text-theme font-semibold">
                                  {estimatedMinutes > 0
                                    ? formatTravelTime(estimatedMinutes)
                                    : '--'}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </StaggerItem>
                    );
                  })}
                </Stagger>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
};

export default RoutePage;
