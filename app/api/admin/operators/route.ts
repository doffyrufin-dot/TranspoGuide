import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminClient = async (req: NextRequest) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('server_env_missing');
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) throw new Error('missing_auth_token');

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);
  if (userError || !user) throw new Error('unauthorized');

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: roleRows, error: roleError } = await serviceClient
    .from('tbl_users')
    .select('role')
    .eq('user_id', user.id)
    .limit(1);
  if (roleError) throw new Error(roleError.message || 'Failed to verify role.');
  const role = (roleRows?.[0]?.role || '').toLowerCase();
  if (role !== 'admin') throw new Error('forbidden');

  return serviceClient;
};

const toStatus = (message: string) => {
  if (message === 'missing_auth_token' || message === 'unauthorized') return 401;
  if (message === 'forbidden') return 403;
  if (message === 'server_env_missing') return 500;
  return 400;
};

export async function GET(req: NextRequest) {
  try {
    const supabase = await getAdminClient(req);

    const { data: appRows, error: appError } = await supabase
      .from('tbl_operator_applications')
      .select(
        'id, user_id, full_name, email, contact_number, address, plate_number, vehicle_model, seating_capacity, drivers_license_url, vehicle_registration_url, franchise_cert_url, admin_notes, status, created_at'
      )
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(500);

    if (appError) {
      throw new Error(appError.message || 'Failed to load operators.');
    }

    const operators = (appRows || []).map((row: any) => ({
      id: row.id,
      user_id: row.user_id || null,
      name: row.full_name || 'Operator',
      email: row.email || '',
      contact: row.contact_number || '',
      address: row.address || '',
      plate_number: row.plate_number || 'N/A',
      vehicle_model: row.vehicle_model || 'Van',
      seating_capacity: Number(row.seating_capacity || 0),
      drivers_license_url: row.drivers_license_url || null,
      vehicle_registration_url: row.vehicle_registration_url || null,
      franchise_cert_url: row.franchise_cert_url || null,
      admin_notes: row.admin_notes || null,
      status: row.status || 'approved',
      approved_at: row.created_at || null,
    }));

    return NextResponse.json({ operators });
  } catch (error: any) {
    const message = error?.message || 'Failed to load approved operators.';
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}
