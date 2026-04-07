import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  resolveAuthStateForUser,
  resolvePathFromAuthState,
} from '@/lib/server/auth-redirect';

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');
const toValidBaseUrl = (value: string) => {
  try {
    return normalizeBaseUrl(new URL(value).toString());
  } catch {
    return '';
  }
};

const isLocalHostname = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

const isLocalUrl = (value: string) => {
  try {
    return isLocalHostname(new URL(value).hostname);
  } catch {
    return false;
  }
};

const resolveRequestOrigin = (request: NextRequest) => {
  const envUrlRaw = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    ''
  ).trim();
  const envUrl = envUrlRaw ? toValidBaseUrl(envUrlRaw) : '';

  const forwardedHost = (
    request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  ).trim();
  const forwardedProto = (request.headers.get('x-forwarded-proto') || '').trim();

  if (forwardedHost) {
    const protocol =
      forwardedProto || (forwardedHost.includes('localhost') ? 'http' : 'https');
    const forwardedOrigin = normalizeBaseUrl(`${protocol}://${forwardedHost}`);

    // If env is stale localhost but request is from a public host, trust request host.
    if (envUrl && isLocalUrl(envUrl) && !isLocalUrl(forwardedOrigin)) {
      return forwardedOrigin;
    }

    if (!envUrl) return forwardedOrigin;
  }

  if (envUrl) return envUrl;
  return normalizeBaseUrl(new URL(request.url).origin);
};

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const requestOrigin = resolveRequestOrigin(request);
  const code = requestUrl.searchParams.get('code');
  const debug = requestUrl.searchParams.get('debug') === '1';
  const flow = requestUrl.searchParams.get('flow');
  const fallbackPath = flow === 'register' ? '/register' : '/login';

  const redirectWithReason = (path: string, reason: string) => {
    const target = new URL(path, requestOrigin);
    if (debug) target.searchParams.set('cb', reason);
    return NextResponse.redirect(target);
  };

  if (!code) {
    return redirectWithReason(fallbackPath, 'no_code');
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: exchangeData, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return redirectWithReason(fallbackPath, 'exchange_error');
  }

  const session = exchangeData.session;
  if (!session) {
    return redirectWithReason(fallbackPath, 'no_session');
  }

  if (flow === 'register') {
    return redirectWithReason('/register', 'oauth_session_ready');
  }

  const state = await resolveAuthStateForUser(
    session.user.id,
    session.user.email || ''
  );
  const path = resolvePathFromAuthState(state);
  return redirectWithReason(path, 'oauth_redirect_ready');
}
