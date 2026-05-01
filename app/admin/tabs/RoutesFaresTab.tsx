'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/utils/supabase/client';
import sileoToast from '@/lib/utils/sileo-toast';
import { Bus, Map as MapIcon, Plus, Trash2 } from 'lucide-react';

type VehicleTypeRow = { id: string; name: string; image_url: string | null; is_active: boolean };
type DestinationRow = {
  id: string;
  origin: string;
  destination: string;
  area_type: string;
  distance_km: number | null;
  is_active: boolean;
};
type DestinationVehicleRow = { destination_id: string; vehicle_type_id: string };
type RouteFareRow = {
  id: string;
  destination_id: string | null;
  origin: string;
  destination: string;
  distance_km: number | null;
  vehicle_type_id: string | null;
  vehicle_type: string;
  regular_fare: number;
  discount_rate: number;
  is_active: boolean;
  vehicle: { id: string; name: string; image_url: string | null } | null;
};
type BarangayFareRow = {
  id: string;
  barangay_name: string;
  distance_km: number;
  tricycle_base_fare: number;
  per_km_increase: number;
  allowed_vehicle_types: string[] | null;
  is_highway: boolean;
  is_active: boolean;
};
type BarangayVehicleTypeRow = {
  barangay_fare_id: string;
  vehicle_type_id: string;
};

const ALLOWED_VEHICLE_TYPES = ['Van', 'Bus', 'Minibus', 'Jeep', 'Multicab', 'Tricycle'] as const;
const HIGHWAY_OPTIONS = ['Bus', 'Minibus', 'Multicab', 'Tricycle'] as const;
const formatMoney = (value: number) => `P${Number(value || 0).toFixed(2)}`;
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
const computeTravelMinutes = (distanceKm: number, vehicleType: string) => {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  const speed = getAverageSpeedKph(vehicleType);
  return Math.max(1, Math.round((distanceKm / speed) * 60));
};
const formatTravelTime = (minutes: number) => {
  const total = Math.max(1, Math.round(minutes || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};
const normalizeName = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

export default function RoutesFaresTab() {
  const [loading, setLoading] = useState(true);
  const [lookupLoading, setLookupLoading] = useState(true);
  const [routeSaving, setRouteSaving] = useState(false);
  const [barangaySaving, setBarangaySaving] = useState(false);
  const [routeDeletingId, setRouteDeletingId] = useState('');
  const [barangayDeletingId, setBarangayDeletingId] = useState('');
  const [routeRows, setRouteRows] = useState<RouteFareRow[]>([]);
  const [barangayRows, setBarangayRows] = useState<BarangayFareRow[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeRow[]>([]);
  const [destinations, setDestinations] = useState<DestinationRow[]>([]);
  const [destinationVehicles, setDestinationVehicles] = useState<DestinationVehicleRow[]>([]);

  const [routeForm, setRouteForm] = useState({
    destination_id: '',
    vehicle_type_id: '',
    distance_km: '',
    travel_time_minutes: '',
    regular_fare: '',
    discount_rate: '0.20',
  });
  const [barangayForm, setBarangayForm] = useState({
    barangay_name: '',
    distance_km: '',
    tricycle_base_fare: '15',
    per_km_increase: '2',
    is_highway: true,
    allowed_vehicle_types: ['Bus', 'Minibus', 'Multicab', 'Tricycle'] as string[],
  });

  const destinationVehicleMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    destinationVehicles.forEach((row) => {
      if (!map.has(row.destination_id)) map.set(row.destination_id, new Set());
      map.get(row.destination_id)?.add(row.vehicle_type_id);
    });
    return map;
  }, [destinationVehicles]);

  const filteredVehicleTypes = useMemo(() => {
    if (!routeForm.destination_id) return [] as VehicleTypeRow[];
    const allowed = destinationVehicleMap.get(routeForm.destination_id);
    if (!allowed || allowed.size === 0) return vehicleTypes;
    return vehicleTypes.filter((item) => allowed.has(item.id));
  }, [routeForm.destination_id, destinationVehicleMap, vehicleTypes]);

  const groupedRoutes = useMemo(() => {
    const grouped = new Map<string, { origin: string; destination: string; distance_km: number | null; vehicles: RouteFareRow[] }>();
    routeRows.forEach((row) => {
      const key = row.destination_id || `${row.origin}___${row.destination}`;
      const existing = grouped.get(key);
      if (existing) existing.vehicles.push(row);
      else grouped.set(key, { origin: row.origin, destination: row.destination, distance_km: row.distance_km, vehicles: [row] });
    });
    return Array.from(grouped.values());
  }, [routeRows]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [routeRes, barangayRes] = await Promise.all([
        supabase
          .from('tbl_route_fares')
          .select(
            'id, destination_id, origin, destination, distance_km, vehicle_type_id, vehicle_type, regular_fare, discount_rate, is_active, vehicle:tbl_vehicle_types(id, name, image_url)'
          )
          .eq('is_active', true)
          .order('origin', { ascending: true })
          .order('destination', { ascending: true }),
        supabase
          .from('tbl_barangay_fares')
          .select(
            'id, barangay_name, distance_km, tricycle_base_fare, per_km_increase, is_highway, is_active'
          )
          .eq('is_active', true)
          .order('barangay_name', { ascending: true }),
      ]);
      if (routeRes.error) throw routeRes.error;
      if (barangayRes.error) throw barangayRes.error;
      const normalizedRoutes = ((routeRes.data || []) as any[]).map((item) => ({
        ...item,
        vehicle: Array.isArray(item.vehicle) ? item.vehicle[0] || null : item.vehicle || null,
      }));
      const barangayBaseRows = (barangayRes.data || []) as Array<{
        id: string;
        barangay_name: string;
        distance_km: number;
        tricycle_base_fare: number;
        per_km_increase: number;
        is_highway: boolean;
        is_active: boolean;
      }>;
      const barangayIds = barangayBaseRows.map((row) => row.id).filter(Boolean);
      const { data: barangayVehicleData, error: barangayVehicleError } = barangayIds.length
        ? await supabase
            .from('tbl_barangay_vehicle_types')
            .select('barangay_fare_id, vehicle_type_id')
            .in('barangay_fare_id', barangayIds)
        : { data: [], error: null as any };
      if (barangayVehicleError) throw barangayVehicleError;

      const vehicleTypeIds = Array.from(
        new Set(
          ((barangayVehicleData || []) as BarangayVehicleTypeRow[])
            .map((row) => row.vehicle_type_id)
            .filter(Boolean)
        )
      );
      const { data: mappedVehicleTypes, error: mappedVehicleTypesError } = vehicleTypeIds.length
        ? await supabase
            .from('tbl_vehicle_types')
            .select('id, name')
            .in('id', vehicleTypeIds)
        : { data: [], error: null as any };
      if (mappedVehicleTypesError) throw mappedVehicleTypesError;

      const vehicleNameById = new Map<string, string>(
        ((mappedVehicleTypes || []) as Array<{ id: string; name: string }>).map((row) => [
          row.id,
          row.name,
        ])
      );
      const mappedVehicleNamesByBarangay = new Map<string, string[]>();
      ((barangayVehicleData || []) as BarangayVehicleTypeRow[]).forEach((row) => {
        const vehicleName = vehicleNameById.get(row.vehicle_type_id);
        if (!vehicleName) return;
        const current = mappedVehicleNamesByBarangay.get(row.barangay_fare_id) || [];
        if (!current.includes(vehicleName)) current.push(vehicleName);
        mappedVehicleNamesByBarangay.set(row.barangay_fare_id, current);
      });

      setRouteRows(normalizedRoutes as RouteFareRow[]);
      setBarangayRows(
        barangayBaseRows.map((row) => ({
          ...row,
          allowed_vehicle_types: mappedVehicleNamesByBarangay.get(row.id) || [],
        }))
      );
    } catch (error: any) {
      sileoToast.error({ title: 'Load failed', description: error?.message || 'Unable to load routes/fares.' });
    } finally {
      setLoading(false);
    }
  };

  const loadLookups = async () => {
    setLookupLoading(true);
    try {
      const [vehiclesRes, destinationRes, mapRes] = await Promise.all([
        supabase.from('tbl_vehicle_types').select('id, name, image_url, is_active').eq('is_active', true).order('name', { ascending: true }),
        supabase
          .from('tbl_vehicle_destinations')
          .select('id, origin, destination, area_type, distance_km, is_active')
          .eq('is_active', true)
          .neq('area_type', 'barangay')
          .order('origin', { ascending: true }),
        supabase.from('tbl_destination_vehicle_types').select('destination_id, vehicle_type_id'),
      ]);
      if (vehiclesRes.error) throw vehiclesRes.error;
      if (destinationRes.error) throw destinationRes.error;
      if (mapRes.error) throw mapRes.error;
      setVehicleTypes(((vehiclesRes.data || []) as VehicleTypeRow[]).filter((v) => ALLOWED_VEHICLE_TYPES.includes(v.name as any)));
      setDestinations((destinationRes.data || []) as DestinationRow[]);
      setDestinationVehicles((mapRes.data || []) as DestinationVehicleRow[]);
    } catch (error: any) {
      sileoToast.error({ title: 'Lookup failed', description: error?.message || 'Unable to load destination/vehicle options.' });
    } finally {
      setLookupLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    void loadLookups();
  }, []);

  const addRouteFare = async () => {
    const destination = destinations.find((d) => d.id === routeForm.destination_id);
    const vehicle = vehicleTypes.find((v) => v.id === routeForm.vehicle_type_id);
    const distance = Number(routeForm.distance_km);
    const travelMinutes = Number(routeForm.travel_time_minutes);
    const fare = Number(routeForm.regular_fare);
    const discount = Number(routeForm.discount_rate || 0.2);
    if (!destination || !vehicle) return sileoToast.warning({ title: 'Missing fields', description: 'Select destination and vehicle type.' });
    if (!Number.isFinite(distance) || distance <= 0) return sileoToast.warning({ title: 'Invalid distance', description: 'Distance must be greater than 0 km.' });
    if (!Number.isFinite(travelMinutes) || travelMinutes <= 0) return sileoToast.warning({ title: 'Invalid travel time', description: 'Travel time must be greater than 0 minute.' });
    if (!Number.isFinite(fare) || fare <= 0) return sileoToast.warning({ title: 'Invalid fare', description: 'Regular fare must be greater than 0.' });
    if (!Number.isFinite(discount) || discount < 0 || discount > 1) return sileoToast.warning({ title: 'Invalid discount', description: 'Discount rate must be from 0 to 1.' });

    setRouteSaving(true);
    try {
      const { error } = await supabase.from('tbl_route_fares').insert({
        destination_id: destination.id,
        origin: destination.origin,
        destination: destination.destination,
        distance_km: distance,
        vehicle_type_id: vehicle.id,
        vehicle_type: vehicle.name,
        regular_fare: fare,
        discount_rate: discount,
        is_active: true,
      });
      if (error) throw error;
      await fetch('/api/public/route-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routes: [
            {
              origin: destination.origin,
              destination: destination.destination,
              vehicle_type: vehicle.name,
              distance_km: distance,
              regular_fare: fare,
              travel_time_minutes: travelMinutes,
            },
          ],
        }),
      }).catch(() => null);
      setRouteForm({
        destination_id: '',
        vehicle_type_id: '',
        distance_km: '',
        travel_time_minutes: '',
        regular_fare: '',
        discount_rate: '0.20',
      });
      sileoToast.success({ title: 'Route fare added' });
      await loadAll();
    } catch (error: any) {
      sileoToast.error({ title: 'Save failed', description: error?.message || 'Unable to add route fare.' });
    } finally {
      setRouteSaving(false);
    }
  };

  const addBarangayFare = async () => {
    const name = normalizeName(barangayForm.barangay_name);
    const distance = Number(barangayForm.distance_km);
    const base = Number(barangayForm.tricycle_base_fare);
    const perKm = Number(barangayForm.per_km_increase);
    if (!name) return sileoToast.warning({ title: 'Missing barangay', description: 'Please input barangay name.' });
    if (!Number.isFinite(distance) || distance < 0) return sileoToast.warning({ title: 'Invalid distance', description: 'Distance must be 0 or higher.' });
    if (!Number.isFinite(base) || base < 0) return sileoToast.warning({ title: 'Invalid base fare', description: 'Base fare must be 0 or higher.' });
    if (!Number.isFinite(perKm) || perKm < 0) return sileoToast.warning({ title: 'Invalid per-km fare', description: 'Per-km increase must be 0 or higher.' });

    setBarangaySaving(true);
    try {
      const { data: insertedBarangayRows, error } = await supabase.from('tbl_barangay_fares').insert({
        barangay_name: name,
        distance_km: distance,
        tricycle_base_fare: base,
        per_km_increase: perKm,
        is_highway: barangayForm.is_highway,
        is_active: true,
      }).select('id').limit(1);
      if (error) throw error;
      const insertedBarangayId = insertedBarangayRows?.[0]?.id as string | undefined;
      if (!insertedBarangayId) throw new Error('Failed to create barangay fare.');

      if (barangayForm.is_highway) {
        const normalizedSelections = Array.from(
          new Set(
            barangayForm.allowed_vehicle_types
              .map((v) => String(v || '').trim())
              .filter(Boolean)
          )
        );
        const selectedVehicleIds = normalizedSelections
          .map((nameValue) => {
            const normalizedName = nameValue.toLowerCase();
            const exactMatch = vehicleTypes.find(
              (item) => item.name.trim().toLowerCase() === normalizedName
            );
            if (exactMatch) return exactMatch.id;

            return null;
          })
          .filter((id): id is string => !!id);

        if (selectedVehicleIds.length > 0) {
          const mapRows = selectedVehicleIds.map((vehicleTypeId) => ({
            barangay_fare_id: insertedBarangayId,
            vehicle_type_id: vehicleTypeId,
          }));
          const { error: mapInsertError } = await supabase
            .from('tbl_barangay_vehicle_types')
            .insert(mapRows);
          if (mapInsertError) throw mapInsertError;
        }
      }

      setBarangayForm({
        barangay_name: '',
        distance_km: '',
        tricycle_base_fare: '15',
        per_km_increase: '2',
        is_highway: true,
        allowed_vehicle_types: ['Bus', 'Minibus', 'Multicab', 'Tricycle'],
      });
      sileoToast.success({ title: 'Barangay fare added' });
      await loadAll();
    } catch (error: any) {
      sileoToast.error({ title: 'Save failed', description: error?.message || 'Unable to add barangay fare.' });
    } finally {
      setBarangaySaving(false);
    }
  };

  const removeRouteFare = async (row: RouteFareRow) => {
    setRouteDeletingId(row.id);
    try {
      const { error } = await supabase.from('tbl_route_fares').update({ is_active: false }).eq('id', row.id);
      if (error) throw error;
      setRouteRows((prev) => prev.filter((item) => item.id !== row.id));
      sileoToast.success({ title: 'Route fare removed' });
    } catch (error: any) {
      sileoToast.error({ title: 'Delete failed', description: error?.message || 'Unable to remove route fare.' });
    } finally {
      setRouteDeletingId('');
    }
  };

  const removeBarangayFare = async (row: BarangayFareRow) => {
    setBarangayDeletingId(row.id);
    try {
      const { error } = await supabase.from('tbl_barangay_fares').update({ is_active: false }).eq('id', row.id);
      if (error) throw error;
      setBarangayRows((prev) => prev.filter((item) => item.id !== row.id));
      sileoToast.success({ title: 'Barangay fare removed' });
    } catch (error: any) {
      sileoToast.error({ title: 'Delete failed', description: error?.message || 'Unable to remove barangay fare.' });
    } finally {
      setBarangayDeletingId('');
    }
  };

  return (
    <div className="admin-tab space-y-6">
      <div>
        <h1 className="text-xl font-bold text-theme">Routes & Fares</h1>
        <p className="text-muted-theme text-sm">Separate city-route fares and barangay fare rules.</p>
      </div>

      <div className="card-glow rounded-2xl p-4 md:p-5">
        <h2 className="text-theme text-base font-semibold mb-3">Add Route Fare</h2>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <select
            className="input-dark md:col-span-2"
            value={routeForm.destination_id}
            onChange={(e) => {
              const nextDestinationId = e.target.value;
              const selectedDestination = destinations.find((d) => d.id === nextDestinationId);
              setRouteForm((prev) => {
                const distance = selectedDestination?.distance_km;
                return {
                  ...prev,
                  destination_id: nextDestinationId,
                  vehicle_type_id: '',
                  distance_km: distance == null ? '' : String(distance),
                  travel_time_minutes: '',
                };
              });
            }}
            disabled={lookupLoading}
          >
            <option value="">{lookupLoading ? 'Loading destinations...' : 'Select destination route'}</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.origin} to {d.destination}
              </option>
            ))}
          </select>
          <select
            className="input-dark"
            value={routeForm.vehicle_type_id}
            onChange={(e) => {
              const nextVehicleId = e.target.value;
              const selectedVehicle = vehicleTypes.find((v) => v.id === nextVehicleId)?.name || '';
              setRouteForm((prev) => {
                const distance = Number(prev.distance_km || 0);
                const computedMinutes =
                  distance > 0 && selectedVehicle ? computeTravelMinutes(distance, selectedVehicle) : 0;
                return {
                  ...prev,
                  vehicle_type_id: nextVehicleId,
                  travel_time_minutes: computedMinutes > 0 ? String(computedMinutes) : prev.travel_time_minutes,
                };
              });
            }}
            disabled={lookupLoading || !routeForm.destination_id}
          >
            <option value="">{!routeForm.destination_id ? 'Select destination first' : 'Select vehicle type'}</option>
            {filteredVehicleTypes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <input
            className="input-dark"
            placeholder="Distance (km)"
            type="number"
            min="0.1"
            step="0.1"
            value={routeForm.distance_km}
            onChange={(e) =>
              setRouteForm((prev) => {
                const distance = Number(e.target.value || 0);
                const vehicleName =
                  vehicleTypes.find((v) => v.id === prev.vehicle_type_id)?.name || '';
                const computedMinutes =
                  distance > 0 && vehicleName ? computeTravelMinutes(distance, vehicleName) : 0;
                return {
                  ...prev,
                  distance_km: e.target.value,
                  travel_time_minutes: computedMinutes > 0 ? String(computedMinutes) : prev.travel_time_minutes,
                };
              })
            }
          />
          <input
            className="input-dark"
            placeholder="Travel time (minutes)"
            type="number"
            min="1"
            step="1"
            value={routeForm.travel_time_minutes}
            onChange={(e) => setRouteForm((prev) => ({ ...prev, travel_time_minutes: e.target.value }))}
          />
          <input
            className="input-dark"
            placeholder="Regular fare"
            type="number"
            min="1"
            step="0.01"
            value={routeForm.regular_fare}
            onChange={(e) => setRouteForm((prev) => ({ ...prev, regular_fare: e.target.value }))}
          />
          <input
            className="input-dark"
            placeholder="Discount rate"
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={routeForm.discount_rate}
            onChange={(e) => setRouteForm((prev) => ({ ...prev, discount_rate: e.target.value }))}
          />
          <button className="btn-primary md:col-span-2 inline-flex items-center justify-center gap-2" onClick={() => void addRouteFare()} disabled={routeSaving}>
            <Plus size={14} /> {routeSaving ? 'Saving...' : 'Add Route Fare'}
          </button>
        </div>
        <p className="text-xs text-muted-theme mt-2">
          Travel time is auto-suggested from distance + vehicle speed, but you can manually adjust it.
        </p>
      </div>

      {loading ? (
        <div className="card-glow rounded-2xl p-8 text-center text-muted-theme text-sm">Loading routes and fares...</div>
      ) : (
        <div className="grid gap-5">
          {groupedRoutes.map((route) => (
            <div key={`${route.origin}-${route.destination}`} className="card-glow rounded-2xl overflow-hidden">
              <div className="p-4 flex justify-between items-center" style={{ background: 'var(--tg-bg-alt)', borderBottom: '1px solid var(--tg-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--tg-subtle)', color: 'var(--primary)' }}>
                    <MapIcon size={16} />
                  </div>
                  <div>
                    <h3 className="font-bold text-theme">
                      {route.origin} <span className="text-muted-theme font-normal">to</span> {route.destination}
                    </h3>
                    <p className="text-xs text-muted-theme">Distance: {route.distance_km == null ? '--' : `${route.distance_km}km`}</p>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--tg-border)' }}>
                      <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Vehicle</th>
                      <th className="text-center p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Travel Time</th>
                      <th className="text-center p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Regular Fare</th>
                      <th className="text-center p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Discounted Fare</th>
                      <th className="text-right p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {route.vehicles.map((v) => {
                      const discountedFare = v.regular_fare * (1 - (v.discount_rate ?? 0.2));
                      return (
                        <tr key={v.id} style={{ borderBottom: '1px solid var(--tg-border)' }} className="hover:bg-[var(--tg-subtle)] transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              {v.vehicle?.image_url ? (
                                <img src={v.vehicle.image_url} alt={v.vehicle.name} className="w-8 h-8 rounded-lg object-cover" />
                              ) : (
                                <Bus size={14} style={{ color: 'var(--primary)' }} />
                              )}
                              <span className="text-theme font-medium">{v.vehicle?.name || v.vehicle_type}</span>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            {v.distance_km && v.distance_km > 0
                              ? formatTravelTime(computeTravelMinutes(v.distance_km, v.vehicle?.name || v.vehicle_type))
                              : '--'}
                          </td>
                          <td className="p-4 text-center">{formatMoney(v.regular_fare)}</td>
                          <td className="p-4 text-center">{formatMoney(discountedFare)}</td>
                          <td className="p-4 text-right">
                            <button onClick={() => void removeRouteFare(v)} disabled={routeDeletingId === v.id} className="text-sm font-medium cursor-pointer inline-flex items-center gap-1" style={{ color: '#ef4444' }}>
                              <Trash2 size={13} /> Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card-glow rounded-2xl p-4 md:p-5">
        <h2 className="text-theme text-base font-semibold mb-3">Add Barangay Fare Rule</h2>
        <p className="text-xs text-muted-theme mb-3">
          Tricycle formula: <span className="font-semibold text-theme">base fare + (distance * per-km increase)</span>. Default per-km increase is P2.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input className="input-dark" placeholder="Barangay name" value={barangayForm.barangay_name} onChange={(e) => setBarangayForm((prev) => ({ ...prev, barangay_name: e.target.value }))} />
          <input className="input-dark" placeholder="Distance km" type="number" min="0" step="0.1" value={barangayForm.distance_km} onChange={(e) => setBarangayForm((prev) => ({ ...prev, distance_km: e.target.value }))} />
          <input className="input-dark" placeholder="Base fare" type="number" min="0" step="0.01" value={barangayForm.tricycle_base_fare} onChange={(e) => setBarangayForm((prev) => ({ ...prev, tricycle_base_fare: e.target.value }))} />
          <input className="input-dark" placeholder="Per-km increase" type="number" min="0" step="0.01" value={barangayForm.per_km_increase} onChange={(e) => setBarangayForm((prev) => ({ ...prev, per_km_increase: e.target.value }))} />
          <button className="btn-primary inline-flex items-center justify-center gap-2" onClick={() => void addBarangayFare()} disabled={barangaySaving}>
            <Plus size={14} /> {barangaySaving ? 'Saving...' : 'Add Barangay'}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-theme">
            <input
              type="checkbox"
              checked={barangayForm.is_highway}
              onChange={(e) =>
                setBarangayForm((prev) => ({ ...prev, is_highway: e.target.checked, allowed_vehicle_types: e.target.checked ? prev.allowed_vehicle_types : [] }))
              }
            />
            Highway barangay
          </label>
          <div className="flex items-center gap-3">
            {HIGHWAY_OPTIONS.map((option) => (
              <label key={option} className="inline-flex items-center gap-2 text-xs text-theme">
                <input
                  type="checkbox"
                  disabled={!barangayForm.is_highway}
                  checked={barangayForm.allowed_vehicle_types.includes(option)}
                  onChange={(e) =>
                    setBarangayForm((prev) => ({
                      ...prev,
                      allowed_vehicle_types: e.target.checked
                        ? [...prev.allowed_vehicle_types, option]
                        : prev.allowed_vehicle_types.filter((item) => item !== option),
                    }))
                  }
                />
                {option}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="card-glow rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--tg-border)' }}>
              <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Barangay</th>
              <th className="text-center p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Distance</th>
              <th className="text-center p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Tricycle Fare</th>
              <th className="text-center p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Highway Vehicles</th>
              <th className="text-right p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-4 text-muted-theme" colSpan={5}>
                  Loading barangay fare rules...
                </td>
              </tr>
            ) : (
              barangayRows.map((row) => {
                const computedFare = row.tricycle_base_fare + row.distance_km * row.per_km_increase;
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--tg-border)' }}>
                    <td className="p-4 text-theme font-semibold">{row.barangay_name}</td>
                    <td className="p-4 text-center text-theme">{row.distance_km} km</td>
                    <td className="p-4 text-center text-theme">{formatMoney(computedFare)}</td>
                    <td className="p-4 text-center text-theme">
                      {row.is_highway ? (row.allowed_vehicle_types || []).join(', ') || '--' : '--'}
                    </td>
                    <td className="p-4 text-right">
                      <button onClick={() => void removeBarangayFare(row)} disabled={barangayDeletingId === row.id} className="text-sm font-medium cursor-pointer inline-flex items-center gap-1" style={{ color: '#ef4444' }}>
                        <Trash2 size={13} /> Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
