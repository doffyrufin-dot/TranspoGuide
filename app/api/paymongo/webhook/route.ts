import { NextRequest, NextResponse } from 'next/server';
import { markReservationPaid, releaseReservationLocks } from '@/lib/db/reservations';

const extractReservationId = (payload: any): string | null => {
  const candidates = [
    payload?.data?.attributes?.data?.attributes?.metadata?.reservation_id,
    payload?.data?.attributes?.data?.attributes?.payments?.[0]?.attributes?.metadata
      ?.reservation_id,
    payload?.data?.attributes?.metadata?.reservation_id,
    payload?.data?.attributes?.data?.attributes?.checkout_session?.metadata
      ?.reservation_id,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const extractPaymentId = (payload: any): string | null => {
  const isPaymentId = (value: unknown) =>
    typeof value === 'string' && value.trim().startsWith('pay_');

  const candidates = [
    payload?.data?.attributes?.data?.attributes?.payments?.[0]?.id,
    payload?.data?.attributes?.data?.id,
    payload?.data?.attributes?.id,
  ];

  for (const value of candidates) {
    if (isPaymentId(value)) return (value as string).trim();
  }

  const walk = (node: any): string | null => {
    if (!node) return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item);
        if (found) return found;
      }
      return null;
    }
    if (typeof node === 'object') {
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (isPaymentId(value)) return (value as string).trim();
        const found = walk(value);
        if (found) return found;
      }
    }
    return null;
  };

  const deepPaymentId = walk(payload);
  if (deepPaymentId) {
    return deepPaymentId;
  }

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const eventType = payload?.data?.attributes?.type as string | undefined;

    const reservationId = extractReservationId(payload);
    if (!reservationId) {
      return NextResponse.json({ ok: true, skipped: 'missing_reservation_id' });
    }

    const paymentId = extractPaymentId(payload) || undefined;

    if (eventType?.includes('paid')) {
      await markReservationPaid(reservationId, paymentId);
      return NextResponse.json({ ok: true, status: 'paid' });
    }

    if (eventType?.includes('failed') || eventType?.includes('expired')) {
      await releaseReservationLocks(reservationId);
      return NextResponse.json({ ok: true, status: 'released' });
    }

    return NextResponse.json({ ok: true, ignored: eventType || 'unknown' });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Webhook handling failed.' },
      { status: 500 }
    );
  }
}
