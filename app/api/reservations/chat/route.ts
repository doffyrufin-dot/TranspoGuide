import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { addReservationMessage, getReservationById } from '@/lib/db/reservations';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const reservationId = (body.reservationId || '').trim();
    const reservationToken = (body.reservationToken || '').trim();
    const message = (body.message || '').trim();
    const senderType = (body.senderType || '').trim();
    const senderName = (body.senderName || '').trim();

    if (!reservationId || !message) {
      return NextResponse.json(
        { error: 'Missing reservationId or message.' },
        { status: 400 }
      );
    }

    if (senderType !== 'passenger' && senderType !== 'operator') {
      return NextResponse.json({ error: 'Invalid senderType.' }, { status: 400 });
    }

    let passengerReservationStatus = '';

    if (senderType === 'passenger') {
      if (!reservationToken) {
        return NextResponse.json(
          { error: 'Missing reservation token.' },
          { status: 400 }
        );
      }
      const reservation = await getReservationById(reservationId, reservationToken);
      if (!reservation) {
        return NextResponse.json(
          { error: 'Invalid reservation access.' },
          { status: 403 }
        );
      }
      passengerReservationStatus = String(reservation.reservation.status || '').toLowerCase();
      if (
        passengerReservationStatus === 'picked_up' ||
        passengerReservationStatus === 'cancelled'
      ) {
        return NextResponse.json(
          { error: 'chat_closed' },
          { status: 409 }
        );
      }
    }

    if (senderType === 'operator') {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) {
        return NextResponse.json({ error: 'server_env_missing' }, { status: 500 });
      }

      const authHeader = req.headers.get('authorization') || '';
      const accessToken = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';
      if (!accessToken) {
        return NextResponse.json({ error: 'missing_auth_token' }, { status: 401 });
      }

      const authClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
      const {
        data: { user },
        error: userError,
      } = await authClient.auth.getUser(accessToken);

      if (userError || !user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }

      const reservation = await getReservationById(reservationId);
      if (!reservation || reservation.reservation.operator_user_id !== user.id) {
        return NextResponse.json(
          { error: 'forbidden_operator_chat' },
          { status: 403 }
        );
      }
      const operatorReservationStatus = String(
        reservation.reservation.status || ''
      ).toLowerCase();
      if (
        operatorReservationStatus === 'picked_up' ||
        operatorReservationStatus === 'cancelled' ||
        operatorReservationStatus === 'rejected'
      ) {
        return NextResponse.json({ error: 'chat_closed' }, { status: 409 });
      }
    }

    const createdMessage = await addReservationMessage({
      reservationId,
      message,
      senderType,
      senderName: senderName || (senderType === 'operator' ? 'Operator' : 'Passenger'),
    });

    if (senderType === 'passenger' && passengerReservationStatus === 'rejected') {
      await addReservationMessage({
        reservationId,
        senderType: 'operator',
        senderName: 'Operator',
        message:
          'Your reservation was rejected. Please create a new reservation and payment if you still want to proceed.',
      });
    }

    return NextResponse.json({ ok: true, message: createdMessage });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to send message.' },
      { status: 500 }
    );
  }
}
