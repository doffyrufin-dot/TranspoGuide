import {
  getApplicationStatus,
  getUserRole,
} from '@/lib/services/users.services';
import { http } from '@/lib/http/client';

type RedirectResult =
  | { type: 'redirect'; path: string }
  | { type: 'pending'; email: string; status: 'pending' | 'rejected' }
  | { type: 'needs_profile' }
  | { type: 'none' };

type ResolveApiResponse = {
  role?: 'admin' | 'operator' | null;
  status?: 'pending' | 'approved' | 'rejected' | null;
  email?: string;
};

async function resolveViaServer(
  accessToken: string,
  userId: string,
  userEmail?: string
): Promise<RedirectResult | null> {
  try {
    const { data: payload } = await http.post<ResolveApiResponse>(
      '/api/auth/resolve-redirect',
      { userId, userEmail },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const role = payload.role ?? null;
    const status = payload.status ?? null;
    const email = payload.email || userEmail || '';

    if (role === 'admin') return { type: 'redirect', path: '/admin' };

    if (status === 'pending' || status === 'rejected') {
      return { type: 'pending', email, status };
    }

    if (role === 'operator' || status === 'approved') {
      return { type: 'redirect', path: '/operator' };
    }

    if (!status) return { type: 'needs_profile' };

    return { type: 'none' };
  } catch {
    return null;
  }
}

export async function resolveUserRedirect(
  userId: string,
  userEmail?: string,
  accessToken?: string
): Promise<RedirectResult> {
  if (accessToken) {
    const serverResolved = await resolveViaServer(accessToken, userId, userEmail);
    if (serverResolved) return serverResolved;
  }

  const role = await getUserRole(userId, userEmail);
  if (role === 'admin') return { type: 'redirect', path: '/admin' };

  const status = await getApplicationStatus(userId);

  if (status === 'pending' || status === 'rejected') {
    return {
      type: 'pending',
      email: userEmail ?? '',
      status,
    };
  }

  if (role === 'operator' || status === 'approved') {
    return { type: 'redirect', path: '/operator' };
  }

  if (!status) {
    return { type: 'needs_profile' };
  }

  return { type: 'none' };
}
