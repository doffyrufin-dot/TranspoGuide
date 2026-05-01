import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
        'id, origin, destination, vehicle_type, regular_fare, discount_rate, distance_km, vehicle:tbl_vehicle_types(name, image_url)'
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
        'id, barangay_name, distance_km, tricycle_base_fare, per_km_increase, is_highway, is_active'
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
      const perKm = Number(row.per_km_increase || 0);

      const tricycleFare = base + distance * perKm;
      const allowedVehicles = vehicleNamesByBarangay.get(String(row.id)) || [];

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
        return {
          id: `barangay-${row.id}-${vehicleType.toLowerCase()}`,
          origin: 'Isabel',
          destination: row.barangay_name || '',
          vehicle_type: vehicleType,
          regular_fare:
            vehicleKey.includes('tricycle')
              ? tricycleFare
              : Number(genericFare?.regular_fare || tricycleFare),
          discount_rate: Number(genericFare?.discount_rate || 0.2),
          distance_km: distance,
          source: 'barangay_fare',
        };
      });
    });

    return NextResponse.json({
      rows: [...routeRows, ...barangayMapped],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load route fares.' },
      { status: 500 }
    );
  }
}
