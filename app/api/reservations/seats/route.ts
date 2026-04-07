import { NextRequest, NextResponse } from 'next/server';
import { getTripSeatStatuses } from '@/lib/db/reservations';

export async function GET(req: NextRequest) {
  try {
    const tripKey = req.nextUrl.searchParams.get('tripKey')?.trim();
    const queueId = req.nextUrl.searchParams.get('queueId')?.trim() || null;
    if (!tripKey) {
      return NextResponse.json({ error: 'Missing tripKey.' }, { status: 400 });
    }

    const result = await getTripSeatStatuses(tripKey, queueId);
    return NextResponse.json({
      trip_key: result.tripKey,
      locked_seats: result.lockedSeats,
      reserved_seats: result.reservedSeats,
      occupied_seats: result.occupiedSeats,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch seat statuses.' },
      { status: 500 }
    );
  }
}
