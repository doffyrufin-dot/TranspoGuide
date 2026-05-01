'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { supabase } from '@/utils/supabase/client';
import sileoToast from '@/lib/utils/sileo-toast';
import { resolveVehicleImageUrl } from '@/lib/utils/vehicle-image';
import { Bus, Map as MapIcon, Pencil, Plus, Trash2, X } from 'lucide-react';

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
  vehicle_image_url: string | null;
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
  allowed_vehicle_types: string[] | null;
  is_highway: boolean;
  is_active: boolean;
};

const ALLOWED_VEHICLE_TYPES = ['Van', 'Bus', 'Minibus', 'Jeep', 'Multicab', 'Trycicle'] as const;
const HIGHWAY_OPTIONS = ['Bus', 'Minibus', 'Multicab', 'Trycicle'] as const;
const formatMoney = (value: number) => `P${Number(value || 0).toFixed(2)}`;
const getAverageSpeedKph = (vehicleType: string) => {
  const key = (vehicleType || '').toLowerCase();
  if (key.includes('bus')) return 45;
  if (key.includes('mini')) return 40;
  if (key.includes('van')) return 50;
  if (key.includes('jeep')) return 35;
  if (key.includes('multi')) return 32;
  if (key.includes('trycicle') || key.includes('tricycle')) return 25;
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

const normalizeImageUrl = (value: string) => {
  const normalized = String(value || '').trim();
  return normalized || '';
};

const fetchSuggestedTravelMinutes = async (input: {
  origin: string;
  destination: string;
  vehicleType: string;
  distanceKm: number;
}) => {
  if (!input.origin.trim() || !input.destination.trim() || !input.vehicleType.trim()) {
    return null;
  }
  if (!Number.isFinite(input.distanceKm) || input.distanceKm <= 0) {
    return null;
  }

  try {
    const response = await fetch('/api/public/route-metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routes: [
          {
            origin: input.origin,
            destination: input.destination,
            vehicle_type: input.vehicleType,
            distance_km: input.distanceKm,
          },
        ],
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) return null;
    const metric = Array.isArray(result?.metrics) ? result.metrics[0] : null;
    const minutes = Number(metric?.duration_minutes || 0);
    return Number.isFinite(minutes) && minutes > 0 ? Math.max(1, Math.round(minutes)) : null;
  } catch {
    return null;
  }
};

const ROUTE_EDIT_INITIAL = {
  distance_km: '',
  travel_time_minutes: '',
  regular_fare: '',
  discount_rate: '0.20',
  vehicle_image_url: '',
};

const BARANGAY_EDIT_INITIAL = {
  barangay_name: '',
  distance_km: '',
  tricycle_base_fare: '15',
  is_highway: true,
  allowed_vehicle_types: ['Bus', 'Minibus', 'Multicab', 'Trycicle'] as string[],
};

export default function RoutesFaresTab() {
  const [isClient, setIsClient] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lookupLoading, setLookupLoading] = useState(true);
  const [routeSaving, setRouteSaving] = useState(false);
  const [barangaySaving, setBarangaySaving] = useState(false);
  const [routeDeletingId, setRouteDeletingId] = useState('');
  const [barangayDeletingId, setBarangayDeletingId] = useState('');
  const [routeTimeLoading, setRouteTimeLoading] = useState(false);
  const [routeEditTimeLoading, setRouteEditTimeLoading] = useState(false);
  const [routeEditingRow, setRouteEditingRow] = useState<RouteFareRow | null>(null);
  const [routeUpdating, setRouteUpdating] = useState(false);
  const [routeImageUploading, setRouteImageUploading] = useState(false);
  const [routeEditImageUploading, setRouteEditImageUploading] = useState(false);
  const [barangayEditingRow, setBarangayEditingRow] = useState<BarangayFareRow | null>(null);
  const [barangayUpdating, setBarangayUpdating] = useState(false);
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
    vehicle_image_url: '',
  });
  const [routeEditForm, setRouteEditForm] = useState(ROUTE_EDIT_INITIAL);
  const [barangayEditForm, setBarangayEditForm] = useState(BARANGAY_EDIT_INITIAL);
  const [barangayForm, setBarangayForm] = useState({
    barangay_name: '',
    distance_km: '',
    tricycle_base_fare: '15',
    is_highway: true,
    allowed_vehicle_types: ['Bus', 'Minibus', 'Multicab', 'Trycicle'] as string[],
  });
  const routeTimeRequestRef = useRef(0);
  const routeEditTimeRequestRef = useRef(0);
  const routeImageInputRef = useRef<HTMLInputElement | null>(null);
  const routeEditImageInputRef = useRef<HTMLInputElement | null>(null);

  const uploadVehicleImageFile = async (file: File): Promise<string> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = String(session?.access_token || '').trim();
    if (!token) {
      throw new Error('Session expired. Please login again.');
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/admin/uploads/vehicle-image', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to upload vehicle image.');
    }

    const nextUrl = String(payload?.url || '').trim();
    if (!nextUrl) {
      throw new Error('Upload finished but image URL is empty.');
    }
    return nextUrl;
  };

  const softDeleteFareByAdmin = async (input: {
    target: 'route_fare' | 'barangay_fare';
    id: string;
  }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = String(session?.access_token || '').trim();
    if (!token) {
      throw new Error('Session expired. Please login again.');
    }

    const response = await fetch('/api/admin/routes-fares', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        target: input.target,
        id: input.id,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to delete fare.');
    }
  };

  const upsertBarangayFareByAdmin = async (input: {
    barangay_name: string;
    distance_km: number;
    tricycle_base_fare: number;
    is_highway: boolean;
    allowed_vehicle_types: string[];
  }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = String(session?.access_token || '').trim();
    if (!token) {
      throw new Error('Session expired. Please login again.');
    }

    const response = await fetch('/api/admin/routes-fares', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'upsert_barangay',
        ...input,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to save barangay fare.');
    }
    return payload as { mode?: 'inserted' | 'updated' };
  };

  const updateBarangayFareByAdmin = async (input: {
    id: string;
    barangay_name: string;
    distance_km: number;
    tricycle_base_fare: number;
    is_highway: boolean;
    allowed_vehicle_types: string[];
  }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = String(session?.access_token || '').trim();
    if (!token) {
      throw new Error('Session expired. Please login again.');
    }

    const response = await fetch('/api/admin/routes-fares', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'update_barangay',
        ...input,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to update barangay fare.');
    }
  };

  const handleUploadRouteImage = async (
    file: File | null,
    target: 'add' | 'edit'
  ) => {
    if (!file) return;

    const fileType = String(file.type || '').toLowerCase();
    if (!fileType.startsWith('image/')) {
      sileoToast.warning({
        title: 'Invalid file',
        description: 'Please select an image file.',
      });
      return;
    }

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      sileoToast.warning({
        title: 'File too large',
        description: 'Max upload size is 5MB.',
      });
      return;
    }

    if (target === 'add') setRouteImageUploading(true);
    if (target === 'edit') setRouteEditImageUploading(true);

    try {
      const uploadedUrl = await uploadVehicleImageFile(file);
      if (target === 'add') {
        setRouteForm((prev) => ({ ...prev, vehicle_image_url: uploadedUrl }));
      } else {
        setRouteEditForm((prev) => ({ ...prev, vehicle_image_url: uploadedUrl }));
      }
      sileoToast.success({ title: 'Vehicle image uploaded' });
    } catch (error: any) {
      sileoToast.error({
        title: 'Upload failed',
        description: error?.message || 'Unable to upload vehicle image.',
      });
    } finally {
      if (target === 'add') {
        setRouteImageUploading(false);
        if (routeImageInputRef.current) routeImageInputRef.current.value = '';
      }
      if (target === 'edit') {
        setRouteEditImageUploading(false);
        if (routeEditImageInputRef.current) routeEditImageInputRef.current.value = '';
      }
    }
  };

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
            'id, destination_id, origin, destination, distance_km, vehicle_type_id, vehicle_type, vehicle_image_url, regular_fare, discount_rate, is_active, vehicle:tbl_vehicle_types(id, name, image_url)'
          )
          .eq('is_active', true)
          .order('origin', { ascending: true })
          .order('destination', { ascending: true }),
        supabase
          .from('tbl_barangay_fares')
          .select(
            'id, barangay_name, distance_km, tricycle_base_fare, allowed_vehicle_types, is_highway, is_active'
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
      setRouteRows(normalizedRoutes as RouteFareRow[]);
      setBarangayRows((barangayRes.data || []) as BarangayFareRow[]);
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
    setIsClient(true);
  }, []);

  useEffect(() => {
    void loadAll();
    void loadLookups();
  }, []);

  useEffect(() => {
    const destination = destinations.find((d) => d.id === routeForm.destination_id);
    const vehicleName =
      vehicleTypes.find((v) => v.id === routeForm.vehicle_type_id)?.name || '';
    const distance = Number(routeForm.distance_km || 0);

    if (!destination || !vehicleName || !Number.isFinite(distance) || distance <= 0) {
      setRouteTimeLoading(false);
      return;
    }

    const requestId = ++routeTimeRequestRef.current;
    setRouteTimeLoading(true);

    const timer = window.setTimeout(async () => {
      const suggestedMinutes = await fetchSuggestedTravelMinutes({
        origin: destination.origin,
        destination: destination.destination,
        vehicleType: vehicleName,
        distanceKm: distance,
      });
      if (routeTimeRequestRef.current !== requestId) return;

      setRouteForm((prev) => {
        if (
          prev.destination_id !== destination.id ||
          prev.vehicle_type_id !== routeForm.vehicle_type_id
        ) {
          return prev;
        }
        const fallbackMinutes = computeTravelMinutes(distance, vehicleName);
        return {
          ...prev,
          travel_time_minutes: String(suggestedMinutes || fallbackMinutes || ''),
        };
      });
      setRouteTimeLoading(false);
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    destinations,
    routeForm.destination_id,
    routeForm.vehicle_type_id,
    routeForm.distance_km,
    vehicleTypes,
  ]);

  useEffect(() => {
    if (!routeEditingRow) {
      setRouteEditTimeLoading(false);
      return;
    }

    const distance = Number(routeEditForm.distance_km || 0);
    const vehicleName = routeEditingRow.vehicle?.name || routeEditingRow.vehicle_type;
    if (!Number.isFinite(distance) || distance <= 0 || !vehicleName.trim()) {
      setRouteEditTimeLoading(false);
      return;
    }

    const requestId = ++routeEditTimeRequestRef.current;
    setRouteEditTimeLoading(true);

    const timer = window.setTimeout(async () => {
      const suggestedMinutes = await fetchSuggestedTravelMinutes({
        origin: routeEditingRow.origin,
        destination: routeEditingRow.destination,
        vehicleType: vehicleName,
        distanceKm: distance,
      });
      if (routeEditTimeRequestRef.current !== requestId) return;
      setRouteEditForm((prev) => ({
        ...prev,
        travel_time_minutes: String(
          suggestedMinutes || computeTravelMinutes(distance, vehicleName) || ''
        ),
      }));
      setRouteEditTimeLoading(false);
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [routeEditingRow, routeEditForm.distance_km]);

  const addRouteFare = async () => {
    const destination = destinations.find((d) => d.id === routeForm.destination_id);
    const vehicle = vehicleTypes.find((v) => v.id === routeForm.vehicle_type_id);
    const distance = Number(routeForm.distance_km);
    const travelMinutes = Number(routeForm.travel_time_minutes);
    const fare = Number(routeForm.regular_fare);
    const discount = Number(routeForm.discount_rate || 0.2);
    const vehicleImageUrl = normalizeImageUrl(routeForm.vehicle_image_url);
    if (!destination || !vehicle) return sileoToast.warning({ title: 'Missing fields', description: 'Select destination and vehicle type.' });
    if (!Number.isFinite(distance) || distance <= 0) return sileoToast.warning({ title: 'Invalid distance', description: 'Distance must be greater than 0 km.' });
    if (!Number.isFinite(travelMinutes) || travelMinutes <= 0) return sileoToast.warning({ title: 'Invalid travel time', description: 'Travel time must be greater than 0 minute.' });
    if (!Number.isFinite(fare) || fare <= 0) return sileoToast.warning({ title: 'Invalid fare', description: 'Regular fare must be greater than 0.' });
    if (!Number.isFinite(discount) || discount < 0 || discount > 1) return sileoToast.warning({ title: 'Invalid discount', description: 'Discount rate must be from 0 to 1.' });

    setRouteSaving(true);
    try {
      const recordPayload = {
        destination_id: destination.id,
        origin: destination.origin,
        destination: destination.destination,
        distance_km: distance,
        vehicle_type_id: vehicle.id,
        vehicle_type: vehicle.name,
        vehicle_image_url: vehicleImageUrl || vehicle.image_url || null,
        regular_fare: fare,
        discount_rate: discount,
        is_active: true,
      };

      const { data: existingRows, error: existingError } = await supabase
        .from('tbl_route_fares')
        .select('id')
        .eq('destination_id', destination.id)
        .eq('vehicle_type_id', vehicle.id)
        .limit(1);
      if (existingError) throw existingError;

      const existingId = String(existingRows?.[0]?.id || '').trim();
      if (existingId) {
        const { error: updateError } = await supabase
          .from('tbl_route_fares')
          .update(recordPayload)
          .eq('id', existingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('tbl_route_fares')
          .insert(recordPayload);
        if (insertError) throw insertError;
      }
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
        vehicle_image_url: '',
      });
      sileoToast.success({
        title: existingId ? 'Route fare updated' : 'Route fare added',
      });
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
    if (!name) return sileoToast.warning({ title: 'Missing barangay', description: 'Please input barangay name.' });
    if (!Number.isFinite(distance) || distance < 0) return sileoToast.warning({ title: 'Invalid distance', description: 'Distance must be 0 or higher.' });
    if (!Number.isFinite(base) || base < 0) return sileoToast.warning({ title: 'Invalid base fare', description: 'Base fare must be 0 or higher.' });

    setBarangaySaving(true);
    try {
      const payload = {
        barangay_name: name,
        distance_km: distance,
        tricycle_base_fare: base,
        is_highway: barangayForm.is_highway,
        allowed_vehicle_types: barangayForm.is_highway
          ? barangayForm.allowed_vehicle_types
          : [],
        is_active: true,
      };

      const result = await upsertBarangayFareByAdmin(payload);
      setBarangayForm({
        barangay_name: '',
        distance_km: '',
        tricycle_base_fare: '15',
        is_highway: true,
        allowed_vehicle_types: ['Bus', 'Minibus', 'Multicab', 'Trycicle'],
      });
      sileoToast.success({
        title: result.mode === 'updated' ? 'Barangay fare updated' : 'Barangay fare added',
      });
      await loadAll();
    } catch (error: any) {
      sileoToast.error({
        title: 'Save failed',
        description: error?.message || 'Unable to add barangay fare.',
      });
    } finally {
      setBarangaySaving(false);
    }
  };

  const openRouteEditModal = (row: RouteFareRow) => {
    const currentDistance = Number(row.distance_km || 0);
    const vehicleName = row.vehicle?.name || row.vehicle_type;
    setRouteEditingRow(row);
    setRouteEditForm({
      distance_km: row.distance_km == null ? '' : String(row.distance_km),
      travel_time_minutes:
        currentDistance > 0
          ? String(computeTravelMinutes(currentDistance, vehicleName))
          : '',
      regular_fare: String(row.regular_fare || ''),
      discount_rate: String(row.discount_rate ?? 0.2),
      vehicle_image_url: row.vehicle_image_url || row.vehicle?.image_url || '',
    });
  };

  const closeRouteEditModal = () => {
    if (routeUpdating) return;
    setRouteEditingRow(null);
    setRouteEditForm(ROUTE_EDIT_INITIAL);
  };

  const saveRouteEdit = async () => {
    if (!routeEditingRow) return;

    const distance = Number(routeEditForm.distance_km);
    const travelMinutes = Number(routeEditForm.travel_time_minutes);
    const fare = Number(routeEditForm.regular_fare);
    const discount = Number(routeEditForm.discount_rate || 0.2);
    const vehicleImageUrl = normalizeImageUrl(routeEditForm.vehicle_image_url);

    if (!Number.isFinite(distance) || distance <= 0) {
      sileoToast.warning({
        title: 'Invalid distance',
        description: 'Distance must be greater than 0 km.',
      });
      return;
    }
    if (!Number.isFinite(travelMinutes) || travelMinutes <= 0) {
      sileoToast.warning({
        title: 'Invalid travel time',
        description: 'Travel time must be greater than 0 minute.',
      });
      return;
    }
    if (!Number.isFinite(fare) || fare <= 0) {
      sileoToast.warning({
        title: 'Invalid fare',
        description: 'Regular fare must be greater than 0.',
      });
      return;
    }
    if (!Number.isFinite(discount) || discount < 0 || discount > 1) {
      sileoToast.warning({
        title: 'Invalid discount',
        description: 'Discount rate must be from 0 to 1.',
      });
      return;
    }

    setRouteUpdating(true);
    try {
      const { error } = await supabase
        .from('tbl_route_fares')
        .update({
          distance_km: distance,
          vehicle_image_url: vehicleImageUrl || null,
          regular_fare: fare,
          discount_rate: discount,
        })
        .eq('id', routeEditingRow.id);
      if (error) throw error;

      await fetch('/api/public/route-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routes: [
            {
              origin: routeEditingRow.origin,
              destination: routeEditingRow.destination,
              vehicle_type: routeEditingRow.vehicle?.name || routeEditingRow.vehicle_type,
              distance_km: distance,
              regular_fare: fare,
              travel_time_minutes: travelMinutes,
            },
          ],
        }),
      }).catch(() => null);

      setRouteRows((prev) =>
        prev.map((item) =>
              item.id === routeEditingRow.id
                ? {
                    ...item,
                    distance_km: distance,
                    vehicle_image_url: vehicleImageUrl || null,
                    regular_fare: fare,
                    discount_rate: discount,
                  }
                : item
        )
      );

      sileoToast.success({ title: 'Route fare updated' });
      setRouteEditingRow(null);
      setRouteEditForm(ROUTE_EDIT_INITIAL);
    } catch (error: any) {
      sileoToast.error({
        title: 'Update failed',
        description: error?.message || 'Unable to update route fare.',
      });
    } finally {
      setRouteUpdating(false);
    }
  };

  const openBarangayEditModal = (row: BarangayFareRow) => {
    setBarangayEditingRow(row);
    setBarangayEditForm({
      barangay_name: row.barangay_name,
      distance_km: String(row.distance_km ?? ''),
      tricycle_base_fare: String(row.tricycle_base_fare ?? '15'),
      is_highway: !!row.is_highway,
      allowed_vehicle_types: row.is_highway
        ? ((row.allowed_vehicle_types || []).filter((item) =>
            HIGHWAY_OPTIONS.includes(item as any)
          ) as string[])
        : [],
    });
  };

  const closeBarangayEditModal = () => {
    if (barangayUpdating) return;
    setBarangayEditingRow(null);
    setBarangayEditForm(BARANGAY_EDIT_INITIAL);
  };

  const saveBarangayEdit = async () => {
    if (!barangayEditingRow) return;

    const name = normalizeName(barangayEditForm.barangay_name);
    const distance = Number(barangayEditForm.distance_km);
    const base = Number(barangayEditForm.tricycle_base_fare);

    if (!name) {
      sileoToast.warning({
        title: 'Missing barangay',
        description: 'Please input barangay name.',
      });
      return;
    }
    if (!Number.isFinite(distance) || distance < 0) {
      sileoToast.warning({
        title: 'Invalid distance',
        description: 'Distance must be 0 or higher.',
      });
      return;
    }
    if (!Number.isFinite(base) || base < 0) {
      sileoToast.warning({
        title: 'Invalid base fare',
        description: 'Base fare must be 0 or higher.',
      });
      return;
    }
    setBarangayUpdating(true);
    try {
      await updateBarangayFareByAdmin({
        id: barangayEditingRow.id,
        barangay_name: name,
        distance_km: distance,
        tricycle_base_fare: base,
        is_highway: barangayEditForm.is_highway,
        allowed_vehicle_types: barangayEditForm.is_highway
          ? barangayEditForm.allowed_vehicle_types
          : [],
      });

      setBarangayRows((prev) =>
        prev.map((item) =>
          item.id === barangayEditingRow.id
            ? {
                ...item,
                barangay_name: name,
                distance_km: distance,
                tricycle_base_fare: base,
                is_highway: barangayEditForm.is_highway,
                allowed_vehicle_types: barangayEditForm.is_highway
                  ? barangayEditForm.allowed_vehicle_types
                  : [],
              }
            : item
        )
      );

      sileoToast.success({ title: 'Barangay fare updated' });
      setBarangayEditingRow(null);
      setBarangayEditForm(BARANGAY_EDIT_INITIAL);
    } catch (error: any) {
      const message = String(error?.message || '');
      sileoToast.error({
        title: 'Update failed',
        description:
          message === 'barangay_name_exists'
            ? 'Barangay name already exists. Please use a different name.'
            : error?.message || 'Unable to update barangay fare.',
      });
    } finally {
      setBarangayUpdating(false);
    }
  };

  const removeRouteFare = async (row: RouteFareRow) => {
    setRouteDeletingId(row.id);
    try {
      await softDeleteFareByAdmin({ target: 'route_fare', id: row.id });
      setRouteRows((prev) => prev.filter((item) => item.id !== row.id));
      if (routeEditingRow?.id === row.id) {
        setRouteEditingRow(null);
        setRouteEditForm(ROUTE_EDIT_INITIAL);
      }
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
      await softDeleteFareByAdmin({ target: 'barangay_fare', id: row.id });
      setBarangayRows((prev) => prev.filter((item) => item.id !== row.id));
      if (barangayEditingRow?.id === row.id) {
        setBarangayEditingRow(null);
        setBarangayEditForm(BARANGAY_EDIT_INITIAL);
      }
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
                  vehicle_image_url: '',
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
              const selectedVehicleRow = vehicleTypes.find((v) => v.id === nextVehicleId) || null;
              const selectedVehicle = selectedVehicleRow?.name || '';
              setRouteForm((prev) => {
                const distance = Number(prev.distance_km || 0);
                const computedMinutes =
                  distance > 0 && selectedVehicle ? computeTravelMinutes(distance, selectedVehicle) : 0;
                return {
                  ...prev,
                  vehicle_type_id: nextVehicleId,
                  travel_time_minutes: computedMinutes > 0 ? String(computedMinutes) : prev.travel_time_minutes,
                  vehicle_image_url: selectedVehicleRow?.image_url || '',
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
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-theme">
              Vehicle Image
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={routeImageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                className="hidden"
                onChange={(e) =>
                  void handleUploadRouteImage(e.target.files?.[0] || null, 'add')
                }
                disabled={routeImageUploading || routeSaving}
              />
              <button
                type="button"
                onClick={() => routeImageInputRef.current?.click()}
                disabled={routeImageUploading || routeSaving}
                className="px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                style={{
                  color: 'var(--primary)',
                  background: 'var(--tg-subtle)',
                  border: '1px solid var(--tg-border-primary)',
                  opacity: routeImageUploading || routeSaving ? 0.6 : 1,
                }}
              >
                {routeImageUploading ? 'Uploading...' : 'Upload Image'}
              </button>
              {normalizeImageUrl(routeForm.vehicle_image_url) && (
                <button
                  type="button"
                  onClick={() =>
                    setRouteForm((prev) => ({ ...prev, vehicle_image_url: '' }))
                  }
                  disabled={routeImageUploading || routeSaving}
                  className="px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                  style={{
                    color: '#ef4444',
                    background: 'var(--tg-subtle)',
                    border: '1px solid var(--tg-border)',
                    opacity: routeImageUploading || routeSaving ? 0.6 : 1,
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
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
          <button
            className="btn-primary md:col-span-2 inline-flex items-center justify-center gap-2"
            onClick={() => void addRouteFare()}
            disabled={routeSaving || routeImageUploading}
          >
            <Plus size={14} /> {routeSaving ? 'Saving...' : 'Add Route Fare'}
          </button>
        </div>
        {normalizeImageUrl(routeForm.vehicle_image_url) && (
          <div className="mt-3">
            <p className="text-xs text-muted-theme mb-1.5">Image preview</p>
            <Image
              src={resolveVehicleImageUrl(routeForm.vehicle_image_url)}
              alt="Vehicle preview"
              width={224}
              height={160}
              className="w-28 h-20 rounded-lg object-cover border"
              style={{ borderColor: 'var(--tg-border)' }}
              sizes="112px"
            />
          </div>
        )}
        <p className="text-xs text-muted-theme mt-2">
          {routeTimeLoading
            ? 'Auto-calculating travel time for selected route and vehicle...'
            : 'Travel time is auto-calculated by route + vehicle, but you can manually adjust it.'}
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
                              {(v.vehicle_image_url || v.vehicle?.image_url) ? (
                                <Image
                                  src={resolveVehicleImageUrl(
                                    v.vehicle_image_url || v.vehicle?.image_url || ''
                                  )}
                                  alt={v.vehicle?.name || v.vehicle_type}
                                  width={32}
                                  height={32}
                                  className="w-8 h-8 rounded-lg object-cover"
                                  sizes="32px"
                                />
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
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => openRouteEditModal(v)}
                                className="p-1.5 rounded-md cursor-pointer"
                                style={{
                                  color: 'var(--primary)',
                                  background: 'var(--tg-subtle)',
                                  border: '1px solid var(--tg-border)',
                                }}
                                title="Edit route fare"
                                aria-label="Edit route fare"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => void removeRouteFare(v)}
                                disabled={routeDeletingId === v.id}
                                className="p-1.5 rounded-md cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                style={{
                                  color: '#ef4444',
                                  background: 'var(--tg-subtle)',
                                  border: '1px solid var(--tg-border)',
                                }}
                                title="Delete route fare"
                                aria-label="Delete route fare"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
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
          Tricycle fare uses a fixed base fare. Distance and travel time shown to commuters are auto-computed from Google Maps.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className="input-dark" placeholder="Barangay name" value={barangayForm.barangay_name} onChange={(e) => setBarangayForm((prev) => ({ ...prev, barangay_name: e.target.value }))} />
          <input className="input-dark" placeholder="Distance km" type="number" min="0" step="0.1" value={barangayForm.distance_km} onChange={(e) => setBarangayForm((prev) => ({ ...prev, distance_km: e.target.value }))} />
          <input className="input-dark" placeholder="Base fare" type="number" min="0" step="0.01" value={barangayForm.tricycle_base_fare} onChange={(e) => setBarangayForm((prev) => ({ ...prev, tricycle_base_fare: e.target.value }))} />
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
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--tg-border)' }}>
                    <td className="p-4 text-theme font-semibold">{row.barangay_name}</td>
                    <td className="p-4 text-center text-theme">{row.distance_km} km</td>
                    <td className="p-4 text-center text-theme">{formatMoney(row.tricycle_base_fare)}</td>
                    <td className="p-4 text-center text-theme">
                      {row.is_highway ? (row.allowed_vehicle_types || []).join(', ') || '--' : '--'}
                    </td>
                    <td className="p-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openBarangayEditModal(row)}
                          className="p-1.5 rounded-md cursor-pointer"
                          style={{
                            color: 'var(--primary)',
                            background: 'var(--tg-subtle)',
                            border: '1px solid var(--tg-border)',
                          }}
                          title="Edit barangay fare"
                          aria-label="Edit barangay fare"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => void removeBarangayFare(row)}
                          disabled={barangayDeletingId === row.id}
                          className="p-1.5 rounded-md cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                          style={{
                            color: '#ef4444',
                            background: 'var(--tg-subtle)',
                            border: '1px solid var(--tg-border)',
                          }}
                          title="Delete barangay fare"
                          aria-label="Delete barangay fare"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {routeEditingRow && isClient
        ? createPortal(
            <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4">
          <div className="card-glow w-full max-w-xl rounded-2xl p-5 md:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-theme text-lg font-bold">Edit City Route Fare</h3>
                <p className="text-xs text-muted-theme mt-1">
                  {routeEditingRow.origin} to {routeEditingRow.destination} -{' '}
                  {routeEditingRow.vehicle?.name || routeEditingRow.vehicle_type}
                </p>
              </div>
              <button
                onClick={closeRouteEditModal}
                className="p-1.5 rounded-md cursor-pointer"
                style={{
                  color: 'var(--tg-muted)',
                  background: 'var(--tg-subtle)',
                  border: '1px solid var(--tg-border)',
                }}
                title="Close"
                aria-label="Close edit modal"
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-1.5">
                  Distance (km)
                </span>
                <input
                  className="input-dark"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={routeEditForm.distance_km}
                  onChange={(e) =>
                    setRouteEditForm((prev) => {
                      const distance = Number(e.target.value || 0);
                      const vehicleName =
                        routeEditingRow.vehicle?.name || routeEditingRow.vehicle_type;
                      const computedMinutes =
                        distance > 0 ? computeTravelMinutes(distance, vehicleName) : 0;
                      return {
                        ...prev,
                        distance_km: e.target.value,
                        travel_time_minutes:
                          computedMinutes > 0
                            ? String(computedMinutes)
                            : prev.travel_time_minutes,
                      };
                    })
                  }
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-1.5">
                  Travel Time (minutes)
                </span>
                <input
                  className="input-dark"
                  type="number"
                  min="1"
                  step="1"
                  value={routeEditForm.travel_time_minutes}
                  onChange={(e) =>
                    setRouteEditForm((prev) => ({
                      ...prev,
                      travel_time_minutes: e.target.value,
                    }))
                  }
                />
                {routeEditTimeLoading && (
                  <p className="text-[11px] text-muted-theme mt-1">
                    Updating suggested travel time...
                  </p>
                )}
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-1.5">
                  Regular Fare
                </span>
                <input
                  className="input-dark"
                  type="number"
                  min="1"
                  step="0.01"
                  value={routeEditForm.regular_fare}
                  onChange={(e) =>
                    setRouteEditForm((prev) => ({
                      ...prev,
                      regular_fare: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-1.5">
                  Discount Rate
                </span>
                <input
                  className="input-dark"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={routeEditForm.discount_rate}
                  onChange={(e) =>
                    setRouteEditForm((prev) => ({
                      ...prev,
                      discount_rate: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="block md:col-span-2">
                <span className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-1.5">
                  Vehicle Image
                </span>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    ref={routeEditImageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    className="hidden"
                    onChange={(e) =>
                      void handleUploadRouteImage(
                        e.target.files?.[0] || null,
                        'edit'
                      )
                    }
                    disabled={routeEditImageUploading || routeUpdating}
                  />
                  <button
                    type="button"
                    onClick={() => routeEditImageInputRef.current?.click()}
                    disabled={routeEditImageUploading || routeUpdating}
                    className="px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                    style={{
                      color: 'var(--primary)',
                      background: 'var(--tg-subtle)',
                      border: '1px solid var(--tg-border-primary)',
                      opacity:
                        routeEditImageUploading || routeUpdating ? 0.6 : 1,
                    }}
                  >
                    {routeEditImageUploading ? 'Uploading...' : 'Upload Image'}
                  </button>
                  {normalizeImageUrl(routeEditForm.vehicle_image_url) && (
                    <button
                      type="button"
                      onClick={() =>
                        setRouteEditForm((prev) => ({
                          ...prev,
                          vehicle_image_url: '',
                        }))
                      }
                      disabled={routeEditImageUploading || routeUpdating}
                      className="px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                      style={{
                        color: '#ef4444',
                        background: 'var(--tg-subtle)',
                        border: '1px solid var(--tg-border)',
                        opacity:
                          routeEditImageUploading || routeUpdating ? 0.6 : 1,
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </label>
            </div>

            {normalizeImageUrl(routeEditForm.vehicle_image_url) && (
              <div className="mt-3">
                <p className="text-xs text-muted-theme mb-1.5">Image preview</p>
                <Image
                  src={resolveVehicleImageUrl(routeEditForm.vehicle_image_url)}
                  alt="Route vehicle preview"
                  width={256}
                  height={160}
                  className="w-32 h-20 rounded-lg object-cover border"
                  style={{ borderColor: 'var(--tg-border)' }}
                  sizes="128px"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={closeRouteEditModal}
                disabled={routeUpdating}
                className="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                style={{
                  color: 'var(--tg-muted)',
                  background: 'var(--tg-subtle)',
                  border: '1px solid var(--tg-border)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void saveRouteEdit()}
                disabled={routeUpdating || routeEditImageUploading}
                className="btn-primary text-sm"
                style={
                  routeUpdating || routeEditImageUploading
                    ? { opacity: 0.7, cursor: 'not-allowed' }
                    : {}
                }
              >
                {routeEditImageUploading
                  ? 'Uploading image...'
                  : routeUpdating
                    ? 'Saving...'
                    : 'Save Changes'}
              </button>
            </div>
          </div>
            </div>,
            document.body
          )
        : null}

      {barangayEditingRow && isClient
        ? createPortal(
            <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4">
              <div className="card-glow w-full max-w-xl rounded-2xl p-5 md:p-6">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-theme text-lg font-bold">Edit Barangay Fare</h3>
                    <p className="text-xs text-muted-theme mt-1">
                      Update the barangay fare rule details below.
                    </p>
                  </div>
                  <button
                    onClick={closeBarangayEditModal}
                    className="p-1.5 rounded-md cursor-pointer"
                    style={{
                      color: 'var(--tg-muted)',
                      background: 'var(--tg-subtle)',
                      border: '1px solid var(--tg-border)',
                    }}
                    title="Close"
                    aria-label="Close edit modal"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block md:col-span-2">
                    <span className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-1.5">
                      Barangay Name
                    </span>
                    <input
                      className="input-dark"
                      type="text"
                      value={barangayEditForm.barangay_name}
                      onChange={(e) =>
                        setBarangayEditForm((prev) => ({
                          ...prev,
                          barangay_name: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="block">
                    <span className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-1.5">
                      Distance (km)
                    </span>
                    <input
                      className="input-dark"
                      type="number"
                      min="0"
                      step="0.1"
                      value={barangayEditForm.distance_km}
                      onChange={(e) =>
                        setBarangayEditForm((prev) => ({
                          ...prev,
                          distance_km: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="block">
                    <span className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-1.5">
                      Tricycle Base Fare
                    </span>
                    <input
                      className="input-dark"
                      type="number"
                      min="0"
                      step="0.01"
                      value={barangayEditForm.tricycle_base_fare}
                      onChange={(e) =>
                        setBarangayEditForm((prev) => ({
                          ...prev,
                          tricycle_base_fare: e.target.value,
                        }))
                      }
                    />
                  </label>

                </div>

                <div className="mt-4 space-y-3">
                  <label className="inline-flex items-center gap-2 text-sm text-theme">
                    <input
                      type="checkbox"
                      checked={barangayEditForm.is_highway}
                      onChange={(e) =>
                        setBarangayEditForm((prev) => ({
                          ...prev,
                          is_highway: e.target.checked,
                          allowed_vehicle_types: e.target.checked
                            ? prev.allowed_vehicle_types
                            : [],
                        }))
                      }
                    />
                    Highway barangay
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    {HIGHWAY_OPTIONS.map((option) => (
                      <label
                        key={option}
                        className="inline-flex items-center gap-2 text-xs text-theme"
                      >
                        <input
                          type="checkbox"
                          disabled={!barangayEditForm.is_highway}
                          checked={barangayEditForm.allowed_vehicle_types.includes(option)}
                          onChange={(e) =>
                            setBarangayEditForm((prev) => ({
                              ...prev,
                              allowed_vehicle_types: e.target.checked
                                ? [...prev.allowed_vehicle_types, option]
                                : prev.allowed_vehicle_types.filter(
                                    (item) => item !== option
                                  ),
                            }))
                          }
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 mt-5">
                  <button
                    onClick={closeBarangayEditModal}
                    disabled={barangayUpdating}
                    className="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                    style={{
                      color: 'var(--tg-muted)',
                      background: 'var(--tg-subtle)',
                      border: '1px solid var(--tg-border)',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void saveBarangayEdit()}
                    disabled={barangayUpdating}
                    className="btn-primary text-sm"
                    style={
                      barangayUpdating ? { opacity: 0.7, cursor: 'not-allowed' } : {}
                    }
                  >
                    {barangayUpdating ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
