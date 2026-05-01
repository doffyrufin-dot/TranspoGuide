import { NextRequest, NextResponse } from 'next/server';
import { requireAdminServiceClient } from '@/lib/server/admin-auth';

type DeletePayload = {
  target?: 'route_fare' | 'barangay_fare';
  id?: string;
};

type UpsertBarangayPayload = {
  action?: 'upsert_barangay' | 'update_barangay';
  id?: string;
  barangay_name?: string;
  distance_km?: number;
  tricycle_base_fare?: number;
  per_km_increase?: number;
  is_highway?: boolean;
  allowed_vehicle_types?: string[];
};

const toStatus = (message: string) => {
  if (message === 'missing_auth_token' || message === 'unauthorized') return 401;
  if (message === 'forbidden') return 403;
  if (message === 'server_env_missing') return 500;
  if (message === 'id_required' || message === 'invalid_target') return 400;
  if (message === 'invalid_action' || message === 'barangay_name_required')
    return 400;
  if (message === 'barangay_name_exists') return 409;
  return 400;
};

export async function DELETE(req: NextRequest) {
  try {
    const { serviceClient: supabase } = await requireAdminServiceClient(req);
    const payload = (await req.json().catch(() => ({}))) as DeletePayload;
    const target = String(payload.target || '').trim();
    const id = String(payload.id || '').trim();

    if (!id) throw new Error('id_required');
    if (target !== 'route_fare' && target !== 'barangay_fare') {
      throw new Error('invalid_target');
    }

    const table =
      target === 'route_fare' ? 'tbl_route_fares' : 'tbl_barangay_fares';
    const { error } = await supabase
      .from(table)
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw new Error(error.message || 'delete_failed');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const message = String(error?.message || 'delete_failed');
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { serviceClient: supabase } = await requireAdminServiceClient(req);
    const payload = (await req.json().catch(() => ({}))) as UpsertBarangayPayload;
    const action = String(payload.action || '').trim();
    if (action !== 'upsert_barangay' && action !== 'update_barangay') {
      throw new Error('invalid_action');
    }

    const id = String(payload.id || '').trim();
    const barangayName = String(payload.barangay_name || '').trim();
    if (!barangayName) throw new Error('barangay_name_required');
    if (action === 'update_barangay' && !id) throw new Error('id_required');

    const rowPayload = {
      barangay_name: barangayName,
      distance_km: Number(payload.distance_km || 0),
      tricycle_base_fare: Number(payload.tricycle_base_fare || 0),
      per_km_increase: Number(payload.per_km_increase || 0),
      is_highway: Boolean(payload.is_highway),
      allowed_vehicle_types: Boolean(payload.is_highway)
        ? Array.isArray(payload.allowed_vehicle_types)
          ? payload.allowed_vehicle_types
          : []
        : [],
      is_active: true,
    };

    const { data: existingRows, error: existingError } = await supabase
      .from('tbl_barangay_fares')
      .select('id')
      .ilike('barangay_name', barangayName)
      .limit(1);
    if (existingError) throw new Error(existingError.message || 'lookup_failed');

    const existingId = String(existingRows?.[0]?.id || '').trim();
    if (action === 'update_barangay') {
      if (existingId && existingId !== id) {
        throw new Error('barangay_name_exists');
      }
      const { error: updateError } = await supabase
        .from('tbl_barangay_fares')
        .update(rowPayload)
        .eq('id', id);
      if (updateError) throw new Error(updateError.message || 'update_failed');
      return NextResponse.json({ success: true, mode: 'updated', id });
    }

    if (existingId) {
      const { error: updateError } = await supabase
        .from('tbl_barangay_fares')
        .update(rowPayload)
        .eq('id', existingId);
      if (updateError) throw new Error(updateError.message || 'update_failed');
      return NextResponse.json({ success: true, mode: 'updated', id: existingId });
    }

    const { data: insertedRows, error: insertError } = await supabase
      .from('tbl_barangay_fares')
      .insert(rowPayload)
      .select('id')
      .limit(1);
    if (insertError) throw new Error(insertError.message || 'insert_failed');

    return NextResponse.json({
      success: true,
      mode: 'inserted',
      id: String(insertedRows?.[0]?.id || ''),
    });
  } catch (error: any) {
    const message = String(error?.message || 'upsert_failed');
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}
