import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  assignWalkInSeat,
  getOperatorTripSeatMap,
  releaseWalkInSeat,
} from '@/lib/db/reservations';

const getAuthedUser = async (req: NextRequest) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('server_env_missing');
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) {
    throw new Error('missing_auth_token');
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
    throw new Error('unauthorized');
  }

  return user;
};

const toStatus = (errorMessage: string) => {
  if (
    errorMessage === 'missing_auth_token' ||
    errorMessage === 'unauthorized'
  ) {
    return 401;
  }
  if (errorMessage === 'server_env_missing') {
    return 500;
  }
  return 400;
};

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    const tripKey = req.nextUrl.searchParams.get('tripKey')?.trim();
    if (!tripKey) {
      return NextResponse.json({ error: 'Missing tripKey.' }, { status: 400 });
    }

    const result = await getOperatorTripSeatMap({
      operatorUserId: user.id,
      tripKey,
    });

    return NextResponse.json({
      trip_key: result.tripKey,
      seats: result.seats,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to load operator seats.';
    const status = toStatus(message);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    const body = await req.json();

    const route = (body.route || '').trim();
    const tripKey = (body.tripKey || '').trim();
    const seatLabel = (body.seatLabel || '').trim();
    const passengerName = (body.passengerName || '').trim();
    const queueId = (body.queueId || '').trim() || null;

    if (!route || !tripKey || !seatLabel || !passengerName) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }

    await assignWalkInSeat({
      operatorUserId: user.id,
      route,
      tripKey,
      seatLabel,
      passengerName,
      queueId,
    });

    const updated = await getOperatorTripSeatMap({
      operatorUserId: user.id,
      tripKey,
    });

    return NextResponse.json({
      ok: true,
      trip_key: updated.tripKey,
      seats: updated.seats,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to assign walk-in seat.';
    const status = toStatus(message);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    const body = await req.json();
    const tripKey = (body.tripKey || '').trim();
    const seatLabel = (body.seatLabel || '').trim();

    if (!tripKey || !seatLabel) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }

    await releaseWalkInSeat({
      operatorUserId: user.id,
      tripKey,
      seatLabel,
    });

    const updated = await getOperatorTripSeatMap({
      operatorUserId: user.id,
      tripKey,
    });

    return NextResponse.json({
      ok: true,
      trip_key: updated.tripKey,
      seats: updated.seats,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to release walk-in seat.';
    const status = toStatus(message);
    return NextResponse.json({ error: message }, { status });
  }
}
