import { NextRequest, NextResponse } from 'next/server';
import { createReservationIntent } from '@/lib/db/reservations';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      fullName,
      contactNumber,
      pickupLocation,
      route,
      seatLabels,
      amount,
      tripKey,
      queueId,
      operatorUserId,
    } = body as {
      fullName: string;
      contactNumber: string;
      pickupLocation: string;
      route: string;
      seatLabels: string[];
      amount: number;
      tripKey: string;
      queueId?: string;
      operatorUserId?: string;
    };

    if (
      !fullName?.trim() ||
      !contactNumber?.trim() ||
      !pickupLocation?.trim() ||
      !route?.trim() ||
      !Array.isArray(seatLabels) ||
      seatLabels.length === 0 ||
      !tripKey?.trim()
    ) {
      return NextResponse.json(
        { error: 'Missing reservation fields.' },
        { status: 400 }
      );
    }

    const intent = await createReservationIntent({
      fullName: fullName.trim(),
      contactNumber: contactNumber.trim(),
      pickupLocation: pickupLocation.trim(),
      route: route.trim(),
      seatLabels,
      amount: Number(amount || 0),
      tripKey: tripKey.trim(),
      queueId: queueId?.trim() || null,
      operatorUserId: operatorUserId?.trim() || null,
    });

    return NextResponse.json({
      reservation_id: intent.reservationId,
      lock_expires_at: intent.expiresAt,
      guest_token: intent.guestToken,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create reservation intent.' },
      { status: 500 }
    );
  }
}
