import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type LoginAttemptRow = {
  id: string;
  identifier: string;
  failed_count: number | null;
  locked_until: string | null;
  last_failed_at: string | null;
  updated_at: string | null;
};

const MAX_FAILED_ATTEMPTS = Math.max(
  3,
  Number(process.env.LOGIN_MAX_FAILED_ATTEMPTS || '5')
);
const LOCK_MINUTES = Math.max(1, Number(process.env.LOGIN_LOCK_MINUTES || '15'));

const normalizeIdentifier = (email: string) => email.trim().toLowerCase();

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

const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('server_env_missing');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const getAuthClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('server_env_missing');
  }
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const readLoginAttempt = async (serviceClient: any, identifier: string) => {
  const { data, error } = await serviceClient
    .from('tbl_login_attempts')
    .select('id, identifier, failed_count, locked_until, last_failed_at, updated_at')
    .eq('identifier', identifier)
    .limit(1);

  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(error.message || 'Failed to load login limiter state.');
  }

  return ((data?.[0] || null) as LoginAttemptRow | null) || null;
};

const saveLoginAttemptFailure = async (
  serviceClient: any,
  input: {
    identifier: string;
    failedCount: number;
    lockUntil: string | null;
    failedAtIso: string;
  }
) => {
  const { error } = await serviceClient.from('tbl_login_attempts').upsert(
    {
      identifier: input.identifier,
      failed_count: input.failedCount,
      locked_until: input.lockUntil,
      last_failed_at: input.failedAtIso,
      updated_at: input.failedAtIso,
    },
    { onConflict: 'identifier' }
  );

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message || 'Failed to update login limiter state.');
  }
};

const resetLoginAttemptState = async (serviceClient: any, identifier: string) => {
  const nowIso = new Date().toISOString();
  const { error } = await serviceClient.from('tbl_login_attempts').upsert(
    {
      identifier,
      failed_count: 0,
      locked_until: null,
      updated_at: nowIso,
    },
    { onConflict: 'identifier' }
  );

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message || 'Failed to reset login limiter state.');
  }
};

const buildLockMessage = (retryAfterSeconds: number) => {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many login attempts. Try again in ${minutes} minute${
    minutes === 1 ? '' : 's'
  }.`;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const identifier = normalizeIdentifier(email);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const serviceClient = getServiceClient();
    const authClient = getAuthClient();

    const attemptRow = await readLoginAttempt(serviceClient, identifier);
    const lockedUntilMs = attemptRow?.locked_until
      ? new Date(attemptRow.locked_until).getTime()
      : 0;
    if (lockedUntilMs > now) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((lockedUntilMs - now) / 1000)
      );
      return NextResponse.json(
        {
          error: buildLockMessage(retryAfterSeconds),
          retry_after_seconds: retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.session || !data?.user) {
      const currentFailedCount = Number(attemptRow?.failed_count || 0);
      const nextFailedCount = currentFailedCount + 1;
      const shouldLock = nextFailedCount >= MAX_FAILED_ATTEMPTS;
      const lockUntilIso = shouldLock
        ? new Date(now + LOCK_MINUTES * 60 * 1000).toISOString()
        : null;

      await saveLoginAttemptFailure(serviceClient, {
        identifier,
        failedCount: nextFailedCount,
        lockUntil: lockUntilIso,
        failedAtIso: nowIso,
      });

      if (shouldLock) {
        return NextResponse.json(
          {
            error: buildLockMessage(LOCK_MINUTES * 60),
            retry_after_seconds: LOCK_MINUTES * 60,
          },
          { status: 429 }
        );
      }

      const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - nextFailedCount);
      const description =
        remaining > 0
          ? `Invalid email or password. ${remaining} attempt${
              remaining === 1 ? '' : 's'
            } remaining.`
          : 'Invalid email or password.';
      return NextResponse.json({ error: description }, { status: 401 });
    }

    await resetLoginAttemptState(serviceClient, identifier);

    return NextResponse.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
      user: {
        id: data.user.id,
        email: data.user.email || email,
      },
      access_token: data.session.access_token,
    });
  } catch (error: any) {
    const message = error?.message || 'Unable to process login request.';
    const status = message === 'server_env_missing' ? 500 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
