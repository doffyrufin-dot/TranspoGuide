import { createClient } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'operator' | null;
export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | null;

export type ResolvedAuthState = {
  role: UserRole;
  status: ApplicationStatus;
  email: string;
};

const normalizeRole = (value: unknown): UserRole => {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'admin' || role === 'operator') return role;
  return null;
};

const normalizeStatus = (value: unknown): ApplicationStatus => {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'pending' || status === 'approved' || status === 'rejected') {
    return status;
  }
  return null;
};

export const resolvePathFromAuthState = (state: ResolvedAuthState): string => {
  if (state.role === 'admin') return '/admin';
  if (state.status === 'pending' || state.status === 'rejected') {
    return `/login?status=${state.status}`;
  }
  if (state.role === 'operator' || state.status === 'approved') return '/operator';
  return '/register';
};

export async function resolveAuthStateForUser(
  userId: string,
  userEmail?: string
): Promise<ResolvedAuthState> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      role: null,
      status: null,
      email: (userEmail || '').trim().toLowerCase(),
    };
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let role: UserRole = null;
  let email = (userEmail || '').trim().toLowerCase();

  const { data: byId } = await service
    .from('tbl_users')
    .select('role, email')
    .eq('user_id', userId)
    .limit(1);

  role = normalizeRole(byId?.[0]?.role);
  if (!email && byId?.[0]?.email) {
    email = String(byId[0].email).trim().toLowerCase();
  }

  if (!role && email) {
    const { data: byEmail } = await service
      .from('tbl_users')
      .select('role, email')
      .ilike('email', email)
      .limit(1);
    role = normalizeRole(byEmail?.[0]?.role);
    if (!email && byEmail?.[0]?.email) {
      email = String(byEmail[0].email).trim().toLowerCase();
    }
  }

  let status: ApplicationStatus = null;

  const { data: appById } = await service
    .from('tbl_operator_applications')
    .select('status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  status = normalizeStatus(appById?.[0]?.status);

  if (!status && email) {
    const { data: appByEmail } = await service
      .from('tbl_operator_applications')
      .select('status')
      .ilike('email', email)
      .order('created_at', { ascending: false })
      .limit(1);
    status = normalizeStatus(appByEmail?.[0]?.status);
  }

  return { role, status, email };
}
