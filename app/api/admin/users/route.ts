import { NextRequest, NextResponse } from 'next/server';
import { requireAdminServiceClient } from '@/lib/server/admin-auth';

type UserPayload = {
  id?: string;
  full_name?: string | null;
  role?: 'admin' | 'operator' | string;
  security_action?: 'unlock' | 'lock_15m' | 'reset_attempts' | string;
  lock_minutes?: number;
};

type LoginAttemptRow = {
  identifier: string;
  failed_count: number | null;
  locked_until: string | null;
  last_failed_at: string | null;
};

const DEFAULT_ADMIN_LOCK_MINUTES = 15;

const toStatus = (message: string) => {
  if (message === 'missing_auth_token' || message === 'unauthorized') return 401;
  if (message === 'forbidden') return 403;
  if (message === 'server_env_missing') return 500;
  if (
    message === 'id_required' ||
    message === 'invalid_role' ||
    message === 'cannot_update_self_role' ||
    message === 'cannot_delete_self' ||
    message === 'last_admin_guard' ||
    message === 'invalid_security_action' ||
    message === 'invalid_lock_minutes' ||
    message === 'email_required_for_security_action'
  ) {
    return 400;
  }
  if (message === 'not_found') return 404;
  return 400;
};

const normalizeIdentifier = (email: string) => String(email || '').trim().toLowerCase();

const isMissingTableError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  const code = String(err.code || '').toUpperCase();
  const message = String(err.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find the table')
  );
};

export async function GET(req: NextRequest) {
  try {
    const { serviceClient } = await requireAdminServiceClient(req);

    const { data, error } = await serviceClient
      .from('tbl_users')
      .select('id, user_id, email, full_name, role, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) throw new Error(error.message || 'load_failed');

    const identifiers = Array.from(
      new Set(
        (data || [])
          .map((row: any) => normalizeIdentifier(String(row?.email || '')))
          .filter(Boolean)
      )
    );

    let attemptMap = new Map<string, LoginAttemptRow>();
    if (identifiers.length > 0) {
      const { data: attempts, error: attemptsError } = await serviceClient
        .from('tbl_login_attempts')
        .select('identifier, failed_count, locked_until, last_failed_at')
        .in('identifier', identifiers);
      if (attemptsError && !isMissingTableError(attemptsError)) {
        throw new Error(attemptsError.message || 'load_failed');
      }
      attemptMap = new Map(
        ((attempts || []) as LoginAttemptRow[]).map((row) => [
          normalizeIdentifier(row.identifier),
          row,
        ])
      );
    }

    const users = (data || []).map((row: any) => ({
      id: String(row.id || ''),
      user_id: String(row.user_id || ''),
      email: String(row.email || ''),
      full_name: row.full_name ? String(row.full_name) : null,
      role: String(row.role || 'operator').toLowerCase(),
      created_at: row.created_at || null,
      security: (() => {
        const identifier = normalizeIdentifier(String(row.email || ''));
        const attempt = attemptMap.get(identifier);
        const lockMs = attempt?.locked_until
          ? new Date(String(attempt.locked_until)).getTime()
          : 0;
        return {
          failed_count: Number(attempt?.failed_count || 0),
          locked_until: attempt?.locked_until || null,
          last_failed_at: attempt?.last_failed_at || null,
          is_locked: lockMs > Date.now(),
        };
      })(),
    }));

    return NextResponse.json(
      { users },
      {
        headers: {
          'Cache-Control': 'private, max-age=20, stale-while-revalidate=40',
        },
      }
    );
  } catch (error: any) {
    const message = String(error?.message || 'load_failed');
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { serviceClient, adminUserId: currentUserId } =
      await requireAdminServiceClient(req);
    const payload = (await req.json().catch(() => ({}))) as UserPayload;

    const id = String(payload.id || '').trim();
    if (!id) throw new Error('id_required');

    const { data: currentRows, error: currentError } = await serviceClient
      .from('tbl_users')
      .select('id, user_id, role, email')
      .eq('id', id)
      .limit(1);
    if (currentError) throw new Error(currentError.message || 'lookup_failed');
    const currentRow = currentRows?.[0] as
      | { id?: string; user_id?: string; role?: string; email?: string }
      | undefined;
    if (!currentRow?.id) throw new Error('not_found');

    const securityAction = String(payload.security_action || '')
      .trim()
      .toLowerCase();
    if (securityAction) {
      if (
        securityAction !== 'unlock' &&
        securityAction !== 'lock_15m' &&
        securityAction !== 'reset_attempts'
      ) {
        throw new Error('invalid_security_action');
      }
      const email = String((currentRow as any).email || '').trim().toLowerCase();
      if (!email) throw new Error('email_required_for_security_action');
      const identifier = normalizeIdentifier(email);
      const now = new Date();
      const nowIso = now.toISOString();
      if (securityAction === 'lock_15m') {
        const rawMinutes = Number(payload.lock_minutes || DEFAULT_ADMIN_LOCK_MINUTES);
        if (!Number.isFinite(rawMinutes) || rawMinutes < 1 || rawMinutes > 720) {
          throw new Error('invalid_lock_minutes');
        }
        const lockMinutes = Math.floor(rawMinutes);
        const lockUntilIso = new Date(
          now.getTime() + lockMinutes * 60 * 1000
        ).toISOString();
        const { error: lockError } = await serviceClient
          .from('tbl_login_attempts')
          .upsert(
            {
              identifier,
              failed_count: 1,
              locked_until: lockUntilIso,
              updated_at: nowIso,
            },
            { onConflict: 'identifier' }
          );
        if (lockError) throw new Error(lockError.message || 'update_failed');
      } else if (securityAction === 'unlock') {
        const { error: unlockError } = await serviceClient
          .from('tbl_login_attempts')
          .upsert(
            {
              identifier,
              failed_count: 0,
              locked_until: null,
              updated_at: nowIso,
            },
            { onConflict: 'identifier' }
          );
        if (unlockError) throw new Error(unlockError.message || 'update_failed');
      } else {
        const { error: resetError } = await serviceClient
          .from('tbl_login_attempts')
          .upsert(
            {
              identifier,
              failed_count: 0,
              locked_until: null,
              updated_at: nowIso,
            },
            { onConflict: 'identifier' }
          );
        if (resetError) throw new Error(resetError.message || 'update_failed');
      }

      return NextResponse.json({ success: true });
    }

    const nextFullName =
      payload.full_name == null ? null : String(payload.full_name).trim();
    const nextRole = String(payload.role || currentRow.role || '')
      .trim()
      .toLowerCase();
    if (nextRole !== 'admin' && nextRole !== 'operator') {
      throw new Error('invalid_role');
    }

    if (
      String(currentRow.user_id || '').trim() === currentUserId &&
      nextRole !== 'admin'
    ) {
      throw new Error('cannot_update_self_role');
    }

    const { error: updateError } = await serviceClient
      .from('tbl_users')
      .update({
        full_name: nextFullName || null,
        role: nextRole,
      })
      .eq('id', id);
    if (updateError) throw new Error(updateError.message || 'update_failed');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const message = String(error?.message || 'update_failed');
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { serviceClient, adminUserId: currentUserId } =
      await requireAdminServiceClient(req);
    const payload = (await req.json().catch(() => ({}))) as UserPayload;

    const id = String(payload.id || '').trim();
    if (!id) throw new Error('id_required');

    const { data: currentRows, error: currentError } = await serviceClient
      .from('tbl_users')
      .select('id, user_id, role')
      .eq('id', id)
      .limit(1);
    if (currentError) throw new Error(currentError.message || 'lookup_failed');
    const currentRow = currentRows?.[0] as
      | { id?: string; user_id?: string; role?: string }
      | undefined;
    if (!currentRow?.id) throw new Error('not_found');

    const targetUserId = String(currentRow.user_id || '').trim();
    if (targetUserId && targetUserId === currentUserId) {
      throw new Error('cannot_delete_self');
    }

    if (String(currentRow.role || '').toLowerCase() === 'admin') {
      const { count, error: countError } = await serviceClient
        .from('tbl_users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin');
      if (countError) throw new Error(countError.message || 'admin_count_failed');
      if (Number(count || 0) <= 1) throw new Error('last_admin_guard');
    }

    const { error: deleteError } = await serviceClient
      .from('tbl_users')
      .delete()
      .eq('id', id);
    if (deleteError) throw new Error(deleteError.message || 'delete_failed');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const message = String(error?.message || 'delete_failed');
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}
