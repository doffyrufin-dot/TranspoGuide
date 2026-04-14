import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listReservationsByOperator } from '@/lib/db/reservations';

const isFinalStatus = (status?: string | null) => {
  const s = (status || '').toLowerCase();
  return (
    s === 'confirmed' ||
    s === 'cancelled' ||
    s === 'rejected' ||
    s === 'picked_up' ||
    s === 'departed'
  );
};

const isPendingStatus = (status?: string | null) => {
  const s = (status || '').toLowerCase();
  return (
    s === 'pending_operator_approval' ||
    s === 'paid'
  );
};

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: 'server_env_missing' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!token) {
      return NextResponse.json({ error: 'missing_auth_token' }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const rows = await listReservationsByOperator(user.id, 120);
    const pending = rows.filter((r: any) => isPendingStatus(r.status));
    const history = rows.filter((r: any) => isFinalStatus(r.status));

    return NextResponse.json({
      pending,
      history,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load reservations.' },
      { status: 500 }
    );
  }
}
