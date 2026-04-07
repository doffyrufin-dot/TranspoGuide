import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  resolveAuthStateForUser,
  resolvePathFromAuthState,
} from '@/lib/server/auth-redirect';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const debug = requestUrl.searchParams.get('debug') === '1';
  const flow = requestUrl.searchParams.get('flow');
  const fallbackPath = flow === 'register' ? '/register' : '/login';

  const redirectWithReason = (path: string, reason: string) => {
    const target = new URL(path, request.url);
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
