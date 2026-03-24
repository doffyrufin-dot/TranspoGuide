import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateReservationStatusByOperator } from '@/lib/db/reservations';

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const reservationId = (body.reservationId || '').trim();
    const status = (body.status || '').trim().toLowerCase();
    if (!reservationId || (status !== 'confirmed' && status !== 'rejected')) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }

    const updated = await updateReservationStatusByOperator({
      reservationId,
      operatorUserId: user.id,
      status: status as 'confirmed' | 'rejected',
    });

    return NextResponse.json({ ok: true, reservation: updated });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update reservation status.' },
      { status: 500 }
    );
  }
}
