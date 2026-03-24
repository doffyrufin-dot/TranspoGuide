import { supabase } from '@/utils/supabase/client';

export type UserRole = 'admin' | 'operator';
export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface UserProfile {
  user_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole | null;
}

export async function getUserRole(
  userId: string,
  userEmail?: string
): Promise<UserRole | null> {
  const { data: byId } = await supabase
    .from('tbl_users')
    .select('role')
    .eq('user_id', userId)
    .limit(1);

  const roleById = byId?.[0]?.role?.trim()?.toLowerCase();
  if (roleById === 'admin' || roleById === 'operator') {
    return roleById;
  }

  if (!userEmail) return null;

  const { data: byEmail } = await supabase
    .from('tbl_users')
    .select('role')
    .ilike('email', userEmail.trim().toLowerCase())
    .limit(1);

  const roleByEmail = byEmail?.[0]?.role?.trim()?.toLowerCase();
  if (roleByEmail === 'admin' || roleByEmail === 'operator') {
    return roleByEmail;
  }

  return null;
}

export async function getApplicationStatus(
  userId: string
): Promise<ApplicationStatus | null> {
  const { data } = await supabase
    .from('tbl_operator_applications')
    .select('status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  const status = data?.[0]?.status?.trim()?.toLowerCase();
  if (status === 'pending' || status === 'approved' || status === 'rejected') {
    return status;
  }

  return null;
}

export async function getUserProfile(
  userId: string
): Promise<UserProfile | null> {
  const { data } = await supabase
    .from('tbl_users')
    .select('user_id, email, full_name, avatar_url, role')
    .eq('user_id', userId)
    .limit(1);

  const row = data?.[0];
  if (!row) return null;

  const normalizedRole = row.role?.trim()?.toLowerCase();
  const role: UserRole | null =
    normalizedRole === 'admin' || normalizedRole === 'operator'
      ? normalizedRole
      : null;

  return {
    user_id: row.user_id,
    email: row.email,
    full_name: row.full_name ?? null,
    avatar_url: row.avatar_url ?? null,
    role,
  };
}
