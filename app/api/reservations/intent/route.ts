import { NextRequest, NextResponse } from 'next/server';
import { createReservationIntent } from '@/lib/db/reservations';

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const parseCoordinatesFromText = (value: string): [number, number] | null => {
  const match = String(value || '').match(
    /(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/
  );
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
};

const normalizePickupLocationWithCoords = (
  pickupLocation: string,
  lat: number,
  lng: number
) => {
  const stripped = String(pickupLocation || '')
    .replace(/\(\s*-?\d{1,2}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*\)\s*$/i, '')
    .trim();
  const coordsText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  if (!stripped) return coordsText;
  return `${stripped} (${coordsText})`;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      fullName,
      passengerEmail,
      contactNumber,
      pickupLocation,
      pickupLat,
      pickupLng,
      route,
      seatLabels,
      amount,
      tripKey,
      queueId,
      operatorUserId,
    } = body as {
      fullName: string;
      passengerEmail: string;
      contactNumber: string;
      pickupLocation: string;
      pickupLat?: number;
      pickupLng?: number;
      route: string;
      seatLabels: string[];
      amount: number;
      tripKey: string;
      queueId?: string;
      operatorUserId?: string;
    };

    if (
      !fullName?.trim() ||
      !passengerEmail?.trim() ||
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
    if (!isValidEmail(passengerEmail)) {
      return NextResponse.json(
        { error: 'Invalid passenger email.' },
        { status: 400 }
      );
    }

    let resolvedCoords: [number, number] | null = null;
    if (Number.isFinite(Number(pickupLat)) && Number.isFinite(Number(pickupLng))) {
      const lat = Number(pickupLat);
      const lng = Number(pickupLng);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        resolvedCoords = [lat, lng];
      }
    }
    if (!resolvedCoords) {
      resolvedCoords = parseCoordinatesFromText(pickupLocation);
    }
    if (!resolvedCoords) {
      return NextResponse.json(
        {
          error:
            'Pickup location is not verified. Please pin your exact pickup point on the map.',
        },
        { status: 400 }
      );
    }

    const normalizedPickupLocation = normalizePickupLocationWithCoords(
      pickupLocation,
      resolvedCoords[0],
      resolvedCoords[1]
    );

    const intent = await createReservationIntent({
      fullName: fullName.trim(),
      passengerEmail: passengerEmail.trim().toLowerCase(),
      contactNumber: contactNumber.trim(),
      pickupLocation: normalizedPickupLocation,
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
