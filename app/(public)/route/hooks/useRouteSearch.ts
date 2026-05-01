'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AppliedFilters,
  type RouteFareRow,
  type RouteMetric,
  fetchRouteFares,
  fetchRouteMetrics,
  filterRowsByInputs,
  normalizeRouteKey,
  sortRowsForDisplay,
} from '../lib/route-search';

export function useRouteSearch() {
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

  const searchIdRef = useRef(0);

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

  const origins = useMemo(() => {
    const values = new Set(
      rows
        .filter((r) => vehicle === 'all' || r.vehicle_type === vehicle)
        .map((r) => r.origin)
        .filter(Boolean)
    );

    // Support swapped barangay search where barangay becomes origin.
    rows
      .filter(
        (r) =>
          r.source === 'barangay_fare' &&
          (vehicle === 'all' || r.vehicle_type === vehicle)
      )
      .forEach((r) => {
        if (r.destination) values.add(r.destination);
      });

    if (origin.trim()) values.add(origin.trim());

    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [rows, vehicle, origin]);

  const destinations = useMemo(() => {
    const values = new Set(
      rows
        .filter((r) => vehicle === 'all' || r.vehicle_type === vehicle)
        .map((r) => r.destination)
        .filter(Boolean)
    );

    // Allow picking base city destination when swapped from barangay origin.
    rows
      .filter(
        (r) =>
          r.source === 'barangay_fare' &&
          (vehicle === 'all' || r.vehicle_type === vehicle)
      )
      .forEach((r) => {
        if (r.origin) values.add(r.origin);
      });

    if (destination.trim()) values.add(destination.trim());

    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [rows, vehicle, destination]);

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
    return sortRowsForDisplay(filteredRows, appliedFilters?.destination || '');
  }, [filteredRows, appliedFilters]);

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const handleSearch = useCallback(async () => {
    searchIdRef.current += 1;
    const currentSearchId = searchIdRef.current;

    let nextFilters: AppliedFilters = { vehicle, origin, destination };
    let selectedRows = filterRowsByInputs(rows, vehicle, origin, destination);

    if (
      selectedRows.length === 0 &&
      destination.trim() &&
      origin.trim() &&
      vehicle
    ) {
      const destinationOnlyRows = filterRowsByInputs(
        rows,
        vehicle,
        '',
        destination
      );
      if (destinationOnlyRows.length > 0) {
        nextFilters = { vehicle, origin: '', destination };
        selectedRows = destinationOnlyRows;
      }
    }

    if (selectedRows.length === 0 && vehicle !== 'all') {
      const allVehicleRows = filterRowsByInputs(
        rows,
        'all',
        nextFilters.origin,
        nextFilters.destination
      );
      if (allVehicleRows.length > 0) {
        nextFilters = { ...nextFilters, vehicle: 'all' };
        selectedRows = allVehicleRows;
        setVehicle('all');
      }
    }

    setAppliedFilters(nextFilters);
    setMetricsByKey({});

    if (selectedRows.length === 0) {
      setMetricsLoading(false);
      return;
    }

    setMetricsLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const payloadRoutes = selectedRows.map((r) => ({
      origin: r.origin,
      destination: r.destination,
      vehicle_type: r.vehicle_type,
      distance_km: r.distance_km,
      regular_fare: r.regular_fare,
    }));

    try {
      const data = await fetchRouteMetrics(payloadRoutes, controller.signal);

      if (currentSearchId !== searchIdRef.current) {
        return;
      }

      const nextMap: Record<string, RouteMetric> = {};
      (data.metrics || []).forEach((m) => {
        nextMap[normalizeRouteKey(m.origin, m.destination, m.vehicle_type)] = m;
      });

      setMetricsByKey(nextMap);
    } catch {
      if (currentSearchId === searchIdRef.current) {
        setMetricsByKey({});
      }
    } finally {
      clearTimeout(timeoutId);
      if (currentSearchId === searchIdRef.current) {
        setMetricsLoading(false);
      }
    }
  }, [vehicle, origin, destination, rows]);

  return {
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
  };
}
