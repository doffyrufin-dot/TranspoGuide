import { NextRequest, NextResponse } from 'next/server';
import {
  getReservationById,
  getReservationMessages,
} from '@/lib/db/reservations';
import { getReservationOperatorFeedback } from '@/lib/db/operator-feedback';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const reservationId = req.nextUrl.searchParams.get('reservationId')?.trim();
    const reservationToken =
      req.nextUrl.searchParams.get('reservationToken')?.trim() || '';
    if (!reservationId) {
      return NextResponse.json({ error: 'Missing reservationId.' }, { status: 400 });
    }

    if (!reservationToken) {
      return NextResponse.json(
        { error: 'Missing reservation access token.' },
        { status: 400 }
      );
    }

    const data = await getReservationById(reservationId, reservationToken);
    if (!data) {
      return NextResponse.json({ error: 'Reservation not found.' }, { status: 404 });
    }

    const [messages, feedback] = await Promise.all([
      getReservationMessages(reservationId),
      getReservationOperatorFeedback(reservationId),
    ]);
    return NextResponse.json(
      {
        reservation: data.reservation,
        operator: data.operator,
        messages,
        feedback,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch reservation status.' },
      { status: 500 }
    );
  }
}
