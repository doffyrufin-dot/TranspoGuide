import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

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

  const getErrorToken = (error: unknown) => {
    if (!error || typeof error !== 'object') return 'unknown';
    const e = error as { code?: string; message?: string };
    const code = (e.code || '').trim();
    const message = (e.message || '').trim().toLowerCase();
    if (code) return code;
    if (message.includes('permission')) return 'permission_denied';
    if (message.includes('rls')) return 'rls_denied';
    if (message.includes('relation')) return 'relation_missing';
    return 'query_error';
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
  const session = exchangeData.session;

  if (exchangeError) {
    return redirectWithReason(fallbackPath, 'exchange_error');
  }

  if (!session) {
    return redirectWithReason(fallbackPath, 'no_session');
  }

  const userId = session.user.id;
  const userEmail = session.user.email;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey && debug) {
    return redirectWithReason(fallbackPath, 'service_key_missing');
  }

  const db = serviceKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : supabase;

  const { data: byId, error: byIdError } = await db
    .from('tbl_users')
    .select('role')
    .eq('user_id', userId)
    .limit(1);

  let role = byId?.[0]?.role?.trim()?.toLowerCase();

  if (!role && userEmail) {
    const { data: byEmail, error: byEmailError } = await db
      .from('tbl_users')
      .select('role')
      .ilike('email', userEmail.trim().toLowerCase())
      .limit(1);
    role = byEmail?.[0]?.role?.trim()?.toLowerCase();

    if (!role && byEmailError && debug) {
      return redirectWithReason(
        fallbackPath,
        `role_email_query_error_${getErrorToken(byEmailError)}`
      );
    }
  }

  if (!role && byIdError && debug) {
    return redirectWithReason(
      fallbackPath,
      `role_id_query_error_${getErrorToken(byIdError)}`
    );
  }

  if (role === 'admin') {
    return redirectWithReason('/admin', 'role_admin');
  }

  const { data: appRows, error: appError } = await db
    .from('tbl_operator_applications')
    .select('status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  const status = appRows?.[0]?.status?.trim()?.toLowerCase();

  if (status === 'pending' || status === 'rejected') {
    const target = new URL(`/login?status=${status}`, request.url);
    if (debug) target.searchParams.set('cb', `app_${status}`);
    return NextResponse.redirect(target);
  }

  if (status === 'approved') {
    return redirectWithReason('/operator', 'app_approved');
  }

  if (role === 'operator') {
    return redirectWithReason('/operator', 'role_operator');
  }

  if (appError && debug) {
    return redirectWithReason(
      fallbackPath,
      `app_query_error_${getErrorToken(appError)}`
    );
  }

  return redirectWithReason(fallbackPath, 'no_role_no_app');
}
