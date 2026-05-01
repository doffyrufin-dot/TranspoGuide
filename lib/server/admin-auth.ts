import { NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type CachedTokenUser = {
  userId: string;
  expiresAt: number;
};

type CachedRole = {
  isAdmin: boolean;
  expiresAt: number;
};

type AuthCacheState = {
  tokenUsers: Map<string, CachedTokenUser>;
  roles: Map<string, CachedRole>;
};

type AdminAuthResult = {
  serviceClient: SupabaseClient;
  adminUserId: string;
};

const AUTH_TTL_MS = 60 * 1000;
const ROLE_TTL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

const getCacheState = (): AuthCacheState => {
  const g = globalThis as typeof globalThis & {
    __tgAdminAuthCache?: AuthCacheState;
  };
  if (!g.__tgAdminAuthCache) {
    g.__tgAdminAuthCache = {
      tokenUsers: new Map(),
      roles: new Map(),
    };
  }
  return g.__tgAdminAuthCache;
};

const trimExpired = <T extends { expiresAt: number }>(map: Map<string, T>) => {
  const now = Date.now();
  for (const [key, value] of map.entries()) {
    if (value.expiresAt <= now) map.delete(key);
  }
  if (map.size > MAX_CACHE_ENTRIES) {
    map.clear();
  }
};

const getEnv = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('server_env_missing');
  }
  return { supabaseUrl, anonKey, serviceRoleKey };
};

const getBearerToken = (req: NextRequest) => {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) throw new Error('missing_auth_token');
  return token;
};

export const requireAdminServiceClient = async (
  req: NextRequest
): Promise<AdminAuthResult> => {
  const { supabaseUrl, anonKey, serviceRoleKey } = getEnv();
  const token = getBearerToken(req);
  const cache = getCacheState();
  const now = Date.now();

  trimExpired(cache.tokenUsers);
  trimExpired(cache.roles);

  let adminUserId = '';
  const cachedUser = cache.tokenUsers.get(token);
  if (cachedUser && cachedUser.expiresAt > now) {
    adminUserId = cachedUser.userId;
  } else {
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);
    if (userError || !user) throw new Error('unauthorized');
    adminUserId = user.id;
    cache.tokenUsers.set(token, {
      userId: adminUserId,
      expiresAt: now + AUTH_TTL_MS,
    });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cachedRole = cache.roles.get(adminUserId);
  if (cachedRole && cachedRole.expiresAt > now) {
    if (!cachedRole.isAdmin) throw new Error('forbidden');
    return { serviceClient, adminUserId };
  }

  const { data: roleRows, error: roleError } = await serviceClient
    .from('tbl_users')
    .select('role')
    .eq('user_id', adminUserId)
    .limit(1);
  if (roleError) throw new Error(roleError.message || 'role_check_failed');

  const role = String(roleRows?.[0]?.role || '').trim().toLowerCase();
  const isAdmin = role === 'admin';
  cache.roles.set(adminUserId, {
    isAdmin,
    expiresAt: now + ROLE_TTL_MS,
  });
  if (!isAdmin) throw new Error('forbidden');

  return { serviceClient, adminUserId };
};

