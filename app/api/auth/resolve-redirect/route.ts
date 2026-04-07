import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveAuthStateForUser } from '@/lib/server/auth-redirect';

type JsonBody = {
  userId?: string;
  userEmail?: string;
};

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnon) {
      return NextResponse.json(
        { error: 'server_env_missing' },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';

    if (!token) {
      return NextResponse.json({ error: 'missing_token' }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as JsonBody;
    const requestUserId = String(body.userId || '').trim();
    const requestEmail = String(body.userEmail || '').trim().toLowerCase();

    if (requestUserId && requestUserId !== user.id) {
      return NextResponse.json(
        { error: 'token_user_mismatch' },
        { status: 403 }
      );
    }

    const state = await resolveAuthStateForUser(
      user.id,
      requestEmail || user.email || ''
    );

    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: 'unexpected_error' }, { status: 500 });
  }
}
