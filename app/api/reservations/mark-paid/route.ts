import { NextRequest, NextResponse } from 'next/server';
import { getReservationById, markReservationPaid } from '@/lib/db/reservations';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const reservationId = String(body?.reservationId || '').trim();
    const reservationToken = String(body?.reservationToken || '').trim();
    const paymentReferenceRaw = String(body?.paymentReference || '').trim();
    const paymentReference = paymentReferenceRaw || undefined;

    if (!reservationId || !reservationToken) {
      return NextResponse.json(
        { error: 'Missing reservationId or reservationToken.' },
        { status: 400 }
      );
    }

    const record = await getReservationById(reservationId, reservationToken);
    if (!record) {
      return NextResponse.json({ error: 'Invalid reservation access.' }, { status: 403 });
    }

    const status = String(record.reservation.status || '').toLowerCase();
    if (status === 'pending_payment') {
      await markReservationPaid(reservationId, paymentReference);
      return NextResponse.json({ ok: true, updated: true });
    }

    if (
      status === 'confirmed' ||
      status === 'departed' ||
      status === 'picked_up' ||
      status === 'paid'
    ) {
      return NextResponse.json({ ok: true, updated: false });
    }

    if (status === 'pending_operator_approval') {
      return NextResponse.json(
        { error: 'Reservation is still waiting for operator approval.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, updated: false });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to mark reservation as paid.');
    const normalized = message.toLowerCase();
    const isConflict =
      normalized.includes('payment window expired') ||
      normalized.includes('waiting for operator approval') ||
      normalized.includes('status does not allow payment');
    return NextResponse.json(
      { error: message },
      { status: isConflict ? 409 : 500 }
    );
  }
}

