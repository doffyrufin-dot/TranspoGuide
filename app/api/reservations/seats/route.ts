import { NextRequest, NextResponse } from 'next/server';
import { getTripSeatStatuses } from '@/lib/db/reservations';

export async function GET(req: NextRequest) {
  try {
    const tripKey = req.nextUrl.searchParams.get('tripKey')?.trim();
    if (!tripKey) {
      return NextResponse.json({ error: 'Missing tripKey.' }, { status: 400 });
    }

    const result = await getTripSeatStatuses(tripKey);
    return NextResponse.json({
      trip_key: result.tripKey,
      locked_seats: result.lockedSeats,
      reserved_seats: result.reservedSeats,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch seat statuses.' },
      { status: 500 }
    );
  }
}

