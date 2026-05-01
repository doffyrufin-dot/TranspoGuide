'use client';

<<<<<<< HEAD
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
  if (key.includes('tricycle')) return <FaTaxi />;
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
  if (key.includes('tricycle')) return '/vehicle/tricycle.jpg';
  return '/vehicle/van.jpg';
};

const getAverageSpeedKph = (label: string) => {
  const key = (label || '').toLowerCase();
  if (key.includes('bus')) return 45;
  if (key.includes('mini')) return 40;
  if (key.includes('van')) return 50;
  if (key.includes('jeep')) return 35;
  if (key.includes('multi')) return 32;
  if (key.includes('tricycle')) return 25;
  return 35;
};

const inferDistanceKmFromFare = (row: RouteFareRow) => {
  const vehicleKey = (row.vehicle_type || '').toLowerCase();
  const fare = Number(row.regular_fare || 0);
  if (fare <= 0) return 0;

  if (vehicleKey.includes('tricycle')) {
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
        a.vehicle_type.toLowerCase().includes('tricycle');
      const bIsPriority =
        b.source === 'barangay_fare' &&
        b.vehicle_type.toLowerCase().includes('tricycle');
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
=======
import React from 'react';
import RouteResultsSection from './components/RouteResultsSection';
import RouteSearchPanel from './components/RouteSearchPanel';
import { useRouteSearch } from './hooks/useRouteSearch';

const RoutePage = () => {
  const {
    vehicle,
    setVehicle,
    origin,
    setOrigin,
    destination,
    setDestination,
    loading,
    loadError,
    appliedFilters,
    metricsByKey,
    metricsLoading,
    vehicleTypes,
    origins,
    destinations,
    displayRows,
    swap,
    handleSearch,
  } = useRouteSearch();
>>>>>>> 8a818bca7aea478f34a0909c19490afcff2cf34c

  return (
    <div>
      <RouteSearchPanel
        vehicle={vehicle}
        origin={origin}
        destination={destination}
        vehicleTypes={vehicleTypes}
        origins={origins}
        destinations={destinations}
        onVehicleChange={setVehicle}
        onOriginChange={setOrigin}
        onDestinationChange={setDestination}
        onSwap={swap}
        onSearch={handleSearch}
      />

      <RouteResultsSection
        show={Boolean(appliedFilters)}
        loading={loading}
        loadError={loadError}
        rows={displayRows}
        metricsByKey={metricsByKey}
        metricsLoading={metricsLoading}
      />
    </div>
  );
};

export default RoutePage;

