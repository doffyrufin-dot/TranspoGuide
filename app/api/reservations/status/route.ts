import { NextRequest, NextResponse } from 'next/server';
import {
  getReservationById,
  getReservationMessages,
} from '@/lib/db/reservations';

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

    const messages = await getReservationMessages(reservationId);
    return NextResponse.json({
      reservation: data.reservation,
      operator: data.operator,
      messages,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch reservation status.' },
      { status: 500 }
    );
  }
}
