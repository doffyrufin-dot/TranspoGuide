import { NextRequest, NextResponse } from 'next/server';
import { getReservationById } from '@/lib/db/reservations';
import {
  createReservationOperatorFeedback,
  getReservationOperatorFeedback,
} from '@/lib/db/operator-feedback';

const isAllowedStatusToRate = (status?: string | null) => {
  const value = String(status || '').toLowerCase();
  return (
    value === 'confirmed' ||
    value === 'paid' ||
    value === 'departed' ||
    value === 'picked_up'
  );
};

const toStatus = (message: string) => {
  const normalized = String(message || '').toLowerCase();
  if (
    normalized.includes('already rated') ||
    normalized.includes('already submitted')
  ) {
    return 409;
  }
  if (normalized.includes('not configured')) {
    return 503;
  }
  return 500;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const reservationId = String(body?.reservationId || '').trim();
    const reservationToken = String(body?.reservationToken || '').trim();
    const feedback = String(body?.feedback || '').trim();
    const ratingRaw = Number(body?.rating);
    const rating = Number.isFinite(ratingRaw) ? Math.round(ratingRaw) : 0;

    if (!reservationId || !reservationToken) {
      return NextResponse.json(
        { error: 'Missing reservationId or reservationToken.' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Rating must be between 1 and 5.' },
        { status: 400 }
      );
    }
    if (feedback.length > 500) {
      return NextResponse.json(
        { error: 'Feedback must be 500 characters or less.' },
        { status: 400 }
      );
    }

    const reservationRecord = await getReservationById(
      reservationId,
      reservationToken
    );
    if (!reservationRecord) {
      return NextResponse.json(
        { error: 'Invalid reservation access.' },
        { status: 403 }
      );
    }

    if (!isAllowedStatusToRate(reservationRecord.reservation.status)) {
      return NextResponse.json(
        {
          error:
            'Rating is available only after your downpayment is completed.',
        },
        { status: 409 }
      );
    }

    const operatorUserId = String(
      reservationRecord.reservation.operator_user_id || ''
    ).trim();
    if (!operatorUserId) {
      return NextResponse.json(
        { error: 'No operator found for this reservation.' },
        { status: 409 }
      );
    }

    const existingFeedback = await getReservationOperatorFeedback(reservationId);
    if (existingFeedback) {
      return NextResponse.json(
        { error: 'You already rated this reservation.', feedback: existingFeedback },
        { status: 409 }
      );
    }

    const created = await createReservationOperatorFeedback({
      reservationId,
      operatorUserId,
      commuterName: reservationRecord.reservation.full_name,
      commuterEmail: reservationRecord.reservation.passenger_email,
      rating,
      feedback,
    });

    return NextResponse.json({ feedback: created });
  } catch (error: any) {
    const message = error?.message || 'Failed to submit operator rating.';
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}
