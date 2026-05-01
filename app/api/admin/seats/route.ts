import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAdminServiceClient } from '@/lib/server/admin-auth';
import {
  assignWalkInSeat,
  getOperatorTripSeatMap,
  releaseWalkInSeat,
} from '@/lib/db/reservations';

const toStatus = (message: string) => {
  if (message === 'missing_auth_token' || message === 'unauthorized') return 401;
  if (message === 'forbidden') return 403;
  if (message === 'server_env_missing') return 500;
  return 400;
};

const getQueueRow = async (supabase: SupabaseClient, queueId: string) => {
  const { data: queueRows, error } = await supabase
    .from('tbl_van_queue')
    .select('id, operator_user_id, route, status')
    .eq('id', queueId)
    .limit(1);

  if (error) throw new Error(error.message || 'Failed to load queue row.');
  const queue = queueRows?.[0];
  if (!queue) throw new Error('Queue entry not found.');
  if (!['queued', 'boarding'].includes((queue.status || '').toLowerCase())) {
    throw new Error('Queue entry is not active.');
  }

  return queue;
};

export async function GET(req: NextRequest) {
  try {
    await requireAdminServiceClient(req);
    const tripKey = req.nextUrl.searchParams.get('tripKey')?.trim() || '';
    const operatorUserId =
      req.nextUrl.searchParams.get('operatorUserId')?.trim() || '';

    if (!tripKey || !operatorUserId) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }

    const result = await getOperatorTripSeatMap({
      operatorUserId,
      tripKey,
    });

    return NextResponse.json(
      {
        ok: true,
        trip_key: result.tripKey,
        seats: result.seats,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=12, stale-while-revalidate=20',
        },
      }
    );
  } catch (error: any) {
    const message = error?.message || 'Failed to load admin seat map.';
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { serviceClient } = await requireAdminServiceClient(req);
    const body = await req.json();
    const queueId = (body.queueId || '').trim();
    const tripKey = (body.tripKey || '').trim();
    const seatLabel = (body.seatLabel || '').trim();
    const passengerName = (body.passengerName || '').trim();
    const isDiscounted = !!body.isDiscounted;

    if (!queueId || !tripKey || !seatLabel || !passengerName) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }

    const queue = await getQueueRow(serviceClient, queueId);

    await assignWalkInSeat({
      operatorUserId: queue.operator_user_id,
      route: queue.route || '',
      tripKey,
      seatLabel,
      passengerName,
      isDiscounted,
      queueId: queue.id,
    });

    const result = await getOperatorTripSeatMap({
      operatorUserId: queue.operator_user_id,
      tripKey,
    });

    return NextResponse.json({
      ok: true,
      trip_key: result.tripKey,
      seats: result.seats,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to assign walk-in seat.';
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { serviceClient } = await requireAdminServiceClient(req);
    const body = await req.json();
    const queueId = (body.queueId || '').trim();
    const tripKey = (body.tripKey || '').trim();
    const seatLabel = (body.seatLabel || '').trim();

    if (!queueId || !tripKey || !seatLabel) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }

    const queue = await getQueueRow(serviceClient, queueId);

    await releaseWalkInSeat({
      operatorUserId: queue.operator_user_id,
      tripKey,
      seatLabel,
    });

    const result = await getOperatorTripSeatMap({
      operatorUserId: queue.operator_user_id,
      tripKey,
    });

    return NextResponse.json({
      ok: true,
      trip_key: result.tripKey,
      seats: result.seats,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to release walk-in seat.';
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}
