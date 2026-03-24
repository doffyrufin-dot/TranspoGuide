import {
  getApplicationStatus,
  getUserRole,
} from '@/lib/services/users.services';

type RedirectResult =
  | { type: 'redirect'; path: string }
  | { type: 'pending'; email: string; status: 'pending' | 'rejected' }
  | { type: 'needs_profile' }
  | { type: 'none' };

export async function resolveUserRedirect(
  userId: string,
  userEmail?: string
): Promise<RedirectResult> {
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
