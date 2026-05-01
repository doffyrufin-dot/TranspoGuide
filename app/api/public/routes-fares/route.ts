import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const HIGHWAY_BRGY_ORDER = [
  'libertad',
  'matlang',
  'bilwang',
  'tubod',
  'tolingon',
  'apale',
];
const BARANGAY_MIN_FARE = 10;
const BARANGAY_HOP_INCREMENT = 1;

const normalizeBarangayName = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^barangay\s+/i, '')
    .replace(/\s+/g, ' ');

const roundMoney = (value: number) =>
  Number.isFinite(value) ? Number(value.toFixed(2)) : 0;

const buildBarangayToBarangayRows = (
  barangayRows: any[]
) => {
  const highwayRows = (barangayRows || [])
    .map((row) => {
      const normalized = normalizeBarangayName(row?.barangay_name || '');
      const orderIndex = HIGHWAY_BRGY_ORDER.indexOf(normalized);
      if (orderIndex < 0) return null;
      return {
        id: String(row?.id || ''),
        barangayName: String(row?.barangay_name || ''),
        normalizedName: normalized,
        orderIndex,
        tricycleFare: Number(row?.tricycle_base_fare || 0),
        distanceKm: Number(row?.distance_km || 0),
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    barangayName: string;
    normalizedName: string;
    orderIndex: number;
    tricycleFare: number;
    distanceKm: number;
  }>;

  if (highwayRows.length < 2) return [];

      const sorted = [...highwayRows].sort((a, b) => a.orderIndex - b.orderIndex);
      const rows: any[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const from = sorted[i];
      const to = sorted[j];
      const hops = Math.abs(to.orderIndex - from.orderIndex);
      if (hops <= 0) continue;

      const forwardFare = roundMoney(
        BARANGAY_MIN_FARE + (hops - 1) * BARANGAY_HOP_INCREMENT
      );
      const segmentDistance = Math.abs(
        Number(to.distanceKm || 0) - Number(from.distanceKm || 0)
      );
      const distanceKm = segmentDistance > 0 ? roundMoney(segmentDistance) : null;

      rows.push({
        id: `barangay-hop-${from.id}-${to.id}-trycicle`,
        origin: from.barangayName,
        destination: to.barangayName,
        vehicle_type: 'Trycicle',
        vehicle_image_url: null,
        regular_fare: forwardFare,
        discount_rate: 0,
        distance_km: distanceKm,
        source: 'barangay_fare',
      });

      rows.push({
        id: `barangay-hop-${to.id}-${from.id}-trycicle`,
        origin: to.barangayName,
        destination: from.barangayName,
        vehicle_type: 'Trycicle',
        vehicle_image_url: null,
        regular_fare: forwardFare,
        discount_rate: 0,
        distance_km: distanceKm,
        source: 'barangay_fare',
      });
    }
  }

  return rows;
};

const estimateBarangayFareByVehicle = (
  vehicleType: string,
  distanceKm: number,
  tricycleFare: number
) => {
  const key = (vehicleType || '').toLowerCase();
  if (key.includes('trycicle') || key.includes('tricycle')) {
    return tricycleFare;
  }

  const farePerKmMap: Record<string, number> = {
    bus: 3.2,
    minibus: 3.4,
    van: 3.8,
    jeep: 2.8,
    multicab: 2.6,
  };

  const matched = Object.keys(farePerKmMap).find((k) => key.includes(k));
  if (!matched || !Number.isFinite(distanceKm) || distanceKm <= 0) {
    return tricycleFare;
  }

  const estimated = distanceKm * farePerKmMap[matched];
  return Number.isFinite(estimated) && estimated > 0
    ? Number(estimated.toFixed(2))
    : tricycleFare;
};

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'server_env_missing' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from('tbl_route_fares')
      .select(
        'id, origin, destination, vehicle_type, vehicle_image_url, regular_fare, discount_rate, distance_km, vehicle:tbl_vehicle_types(name, image_url)'
      )
      .eq('is_active', true)
      .order('origin', { ascending: true })
      .order('destination', { ascending: true })
      .order('vehicle_type', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Failed to load route fares.' },
        { status: 400 }
      );
    }

    const { data: barangayRows, error: barangayError } = await supabase
      .from('tbl_barangay_fares')
      .select(
<<<<<<< HEAD
        'id, barangay_name, distance_km, tricycle_base_fare, per_km_increase, is_highway, is_active'
=======
        'id, barangay_name, distance_km, tricycle_base_fare, is_highway, allowed_vehicle_types, is_active'
>>>>>>> 8a818bca7aea478f34a0909c19490afcff2cf34c
      )
      .eq('is_active', true)
      .order('barangay_name', { ascending: true });

    if (barangayError) {
      return NextResponse.json(
        { error: barangayError.message || 'Failed to load barangay fares.' },
        { status: 400 }
      );
    }

    const barangayIds = (barangayRows || [])
      .map((row: any) => row.id)
      .filter(Boolean);

    const { data: barangayVehicleRows, error: barangayVehicleError } = barangayIds.length
      ? await supabase
          .from('tbl_barangay_vehicle_types')
          .select('barangay_fare_id, vehicle_type_id')
          .in('barangay_fare_id', barangayIds)
      : { data: [], error: null as any };

    if (barangayVehicleError) {
      return NextResponse.json(
        { error: barangayVehicleError.message || 'Failed to load barangay vehicle mapping.' },
        { status: 400 }
      );
    }

    const vehicleTypeIds = Array.from(
      new Set((barangayVehicleRows || []).map((row: any) => row.vehicle_type_id).filter(Boolean))
    );
    const { data: vehicleRows, error: vehicleError } = vehicleTypeIds.length
      ? await supabase
          .from('tbl_vehicle_types')
          .select('id, name')
          .in('id', vehicleTypeIds)
      : { data: [], error: null as any };

    if (vehicleError) {
      return NextResponse.json(
        { error: vehicleError.message || 'Failed to load vehicle type names.' },
        { status: 400 }
      );
    }

    const vehicleNameById = new Map<string, string>(
      (vehicleRows || []).map((row: any) => [String(row.id), String(row.name || '').trim()])
    );
    const vehicleNamesByBarangay = new Map<string, string[]>();
    (barangayVehicleRows || []).forEach((row: any) => {
      const barangayId = String(row.barangay_fare_id || '').trim();
      const vehicleTypeId = String(row.vehicle_type_id || '').trim();
      const vehicleName = vehicleNameById.get(vehicleTypeId) || '';
      if (!barangayId || !vehicleName) return;
      const current = vehicleNamesByBarangay.get(barangayId) || [];
      if (!current.includes(vehicleName)) current.push(vehicleName);
      vehicleNamesByBarangay.set(barangayId, current);
    });

    const routeRows = (data || []).map((row: any) => ({
      id: row.id,
      origin: row.origin || '',
      destination: row.destination || '',
      vehicle_type: row.vehicle_type || row.vehicle?.name || '',
      vehicle_image_url:
        typeof row.vehicle_image_url === 'string' && row.vehicle_image_url.trim()
          ? row.vehicle_image_url.trim()
          : row.vehicle?.image_url || null,
      regular_fare: Number(row.regular_fare || 0),
      discount_rate: Number(row.discount_rate || 0.2),
      distance_km: row.distance_km == null ? null : Number(row.distance_km),
      source: 'route_fare',
    }));

    const genericBarangayVehicleFareMap = new Map<
      string,
      { regular_fare: number; discount_rate: number }
    >();

    routeRows.forEach((row: any) => {
      const destination = (row.destination || '').toLowerCase();
      const vehicle = (row.vehicle_type || '').toLowerCase();
      if (!destination.includes('barangay')) return;
      if (!vehicle) return;
      genericBarangayVehicleFareMap.set(vehicle, {
        regular_fare: Number(row.regular_fare || 0),
        discount_rate: Number(row.discount_rate || 0.2),
      });
    });

    const barangayMapped = (barangayRows || []).flatMap((row: any) => {
      const base = Number(row.tricycle_base_fare || 0);
      const distance = Number(row.distance_km || 0);
<<<<<<< HEAD
      const perKm = Number(row.per_km_increase || 0);

      const tricycleFare = base + distance * perKm;
      const allowedVehicles = vehicleNamesByBarangay.get(String(row.id)) || [];
=======
      const tricycleFare = base;
      const allowedVehicles = Array.isArray(row.allowed_vehicle_types)
        ? (row.allowed_vehicle_types as string[])
        : [];
>>>>>>> 8a818bca7aea478f34a0909c19490afcff2cf34c

      const fallbackHighwayVehicles = ['Bus', 'Minibus', 'Multicab', 'Tricycle'];
      const baseVehicles =
        allowedVehicles.length > 0
          ? allowedVehicles
          : row.is_highway
            ? fallbackHighwayVehicles
            : ['Tricycle'];

      const normalized = Array.from(
        new Set(
          [...baseVehicles, 'Tricycle']
            .map((v) => String(v || '').trim())
            .filter(Boolean)
        )
      );

      return normalized.map((vehicleType) => {
        const vehicleKey = vehicleType.toLowerCase();
        const genericFare = genericBarangayVehicleFareMap.get(vehicleKey);
        const estimatedVehicleFare = estimateBarangayFareByVehicle(
          vehicleType,
          distance,
          tricycleFare
        );
        return {
          id: `barangay-${row.id}-${vehicleType.toLowerCase()}`,
          origin: 'Isabel',
          destination: row.barangay_name || '',
          vehicle_type: vehicleType,
          vehicle_image_url: null,
          regular_fare:
            vehicleKey.includes('tricycle')
              ? tricycleFare
              : Number(genericFare?.regular_fare || estimatedVehicleFare),
          // Barangay routes do not have discounted fares.
          discount_rate: 0,
          distance_km: distance,
          source: 'barangay_fare',
        };
      });
    });

    const barangayToBarangayRows = buildBarangayToBarangayRows(
      barangayRows || []
    );

    return NextResponse.json({
      rows: [...routeRows, ...barangayMapped, ...barangayToBarangayRows],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load route fares.' },
      { status: 500 }
    );
  }
}
