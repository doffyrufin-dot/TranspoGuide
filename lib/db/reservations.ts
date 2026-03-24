import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

export interface CreateReservationIntentInput {
  fullName: string;
  contactNumber: string;
  pickupLocation: string;
  route: string;
  seatLabels: string[];
  amount: number;
  tripKey: string;
  queueId?: string | null;
  operatorUserId?: string | null;
}

const createGuestToken = () => randomBytes(24).toString('hex');

const LOCK_MINUTES = Number(process.env.SEAT_LOCK_MINUTES || '5');

const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service env is missing.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const lockExpiresAtIso = () =>
  new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();

export async function createReservationIntent(input: CreateReservationIntentInput) {
  const supabase = getServiceClient();
  const seatLabels = input.seatLabels.map((s) => s.trim()).filter(Boolean);
  if (seatLabels.length === 0) {
    throw new Error('Please select at least one seat.');
  }

  const nowIso = new Date().toISOString();
  await supabase
    .from('tbl_seat_locks')
    .delete()
    .lt('expires_at', nowIso)
    .eq('status', 'locked');

  const { data: activeLocks, error: lockFetchError } = await supabase
    .from('tbl_seat_locks')
    .select('seat_label')
    .eq('trip_key', input.tripKey)
    .eq('status', 'locked')
    .in('seat_label', seatLabels)
    .gt('expires_at', nowIso);

  if (lockFetchError) {
    throw new Error(lockFetchError.message || 'Failed to check seat locks.');
  }

  if ((activeLocks || []).length > 0) {
    const locked = (activeLocks || []).map((l: any) => l.seat_label).join(', ');
    throw new Error(`Seat(s) already locked: ${locked}`);
  }

  const { data: reservationRows, error: reservationError } = await supabase
    .from('tbl_reservations')
    .insert({
      full_name: input.fullName,
      contact_number: input.contactNumber,
      pickup_location: input.pickupLocation,
      route: input.route,
      seat_labels: seatLabels,
      seat_count: seatLabels.length,
      amount_due: input.amount,
      status: 'pending_payment',
      trip_key: input.tripKey,
      lock_expires_at: lockExpiresAtIso(),
      queue_id: input.queueId || null,
      operator_user_id: input.operatorUserId || null,
      guest_token: createGuestToken(),
    })
    .select('id, guest_token')
    .limit(1);

  if (reservationError || !reservationRows?.[0]) {
    throw new Error(reservationError?.message || 'Failed to create reservation.');
  }

  const reservationId = reservationRows[0].id as string;
  const guestToken = (reservationRows[0] as any).guest_token as string;
  const expiresAt = lockExpiresAtIso();
  const lockRows = seatLabels.map((seatLabel) => ({
    reservation_id: reservationId,
    trip_key: input.tripKey,
    seat_label: seatLabel,
    status: 'locked',
    expires_at: expiresAt,
  }));

  const { error: lockInsertError } = await supabase
    .from('tbl_seat_locks')
    .insert(lockRows);

  if (lockInsertError) {
    await supabase.from('tbl_reservations').delete().eq('id', reservationId);
    throw new Error(lockInsertError.message || 'Failed to lock selected seats.');
  }

  return {
    reservationId,
    expiresAt,
    guestToken,
  };
}

export async function getReservationById(reservationId: string, guestToken?: string) {
  const supabase = getServiceClient();

  const { data: reservationRows, error } = await supabase
    .from('tbl_reservations')
    .select(
      'id, full_name, contact_number, pickup_location, route, seat_labels, seat_count, amount_due, status, payment_id, paid_at, created_at, operator_user_id, queue_id, guest_token, updated_at'
    )
    .eq('id', reservationId)
    .limit(1);

  if (error) throw new Error(error.message || 'Failed to fetch reservation.');
  const reservation = reservationRows?.[0];
  if (!reservation) return null;
  if (guestToken && reservation.guest_token !== guestToken) return null;

  let operator: { name: string; email: string } | null = null;
  if (reservation.operator_user_id) {
    const { data: userRows } = await supabase
      .from('tbl_users')
      .select('full_name, email')
      .eq('user_id', reservation.operator_user_id)
      .limit(1);

    if (userRows?.[0]) {
      operator = {
        name: userRows[0].full_name || 'Operator',
        email: userRows[0].email || '',
      };
    }
  }

  return { reservation, operator };
}

export async function getReservationMessages(reservationId: string) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('tbl_reservation_messages')
    .select('id, sender_type, sender_name, message, created_at')
    .eq('reservation_id', reservationId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) throw new Error(error.message || 'Failed to fetch messages.');
  return data || [];
}

export async function addReservationMessage(input: {
  reservationId: string;
  senderType: 'passenger' | 'operator';
  senderName: string;
  message: string;
}) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('tbl_reservation_messages')
    .insert({
      reservation_id: input.reservationId,
      sender_type: input.senderType,
      sender_name: input.senderName || null,
      message: input.message,
    })
    .select('id, sender_type, sender_name, message, created_at')
    .limit(1);

  if (error) throw new Error(error.message || 'Failed to send message.');
  if (!data?.[0]) throw new Error('Failed to send message.');
  return data[0];
}

export async function markReservationPaid(reservationId: string, paymentId?: string) {
  const supabase = getServiceClient();
  const nowIso = new Date().toISOString();
  const AUTO_PAYMENT_PREFIX = 'Payment completed. Payment Reference: ';
  const isExactPaymentId = (value?: string | null) =>
    typeof value === 'string' && value.trim().startsWith('pay_');

  const { data: reservationRows, error: reservationReadError } = await supabase
    .from('tbl_reservations')
    .select('id, full_name, payment_id')
    .eq('id', reservationId)
    .limit(1);

  if (reservationReadError) {
    throw new Error(reservationReadError.message || 'Failed to read reservation.');
  }

  const reservation = reservationRows?.[0];
  if (!reservation) {
    throw new Error('Reservation not found.');
  }

  const incomingPaymentReference = (paymentId || '').trim();
  const currentPaymentReference = (reservation.payment_id || '').trim();
  const resolvedPaymentReference =
    isExactPaymentId(incomingPaymentReference)
      ? incomingPaymentReference
      : isExactPaymentId(currentPaymentReference)
        ? currentPaymentReference
        : incomingPaymentReference || currentPaymentReference || null;

  const { error: reservationError } = await supabase
    .from('tbl_reservations')
    .update({
      status: 'pending_operator_approval',
      payment_id: resolvedPaymentReference,
      paid_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', reservationId);

  if (reservationError) {
    throw new Error(reservationError.message || 'Failed to mark reservation as paid.');
  }

  const { error: lockError } = await supabase
    .from('tbl_seat_locks')
    .update({
      status: 'reserved',
      expires_at: null,
    })
    .eq('reservation_id', reservationId);

  if (lockError) {
    throw new Error(lockError.message || 'Failed to update seat lock status.');
  }

  const paymentReference = resolvedPaymentReference || '';
  const autoMessage = `${AUTO_PAYMENT_PREFIX}${paymentReference}`;

  const { data: existingMessageRows, error: messageReadError } = await supabase
    .from('tbl_reservation_messages')
    .select('id, message')
    .eq('reservation_id', reservationId)
    .eq('sender_type', 'passenger')
    .order('created_at', { ascending: false })
    .limit(50);

  if (messageReadError) {
    throw new Error(messageReadError.message || 'Failed to verify payment message.');
  }

  const existingPaymentMessage = (existingMessageRows || []).find((row: any) =>
    String(row?.message || '').startsWith(AUTO_PAYMENT_PREFIX)
  ) as { id: string; message: string } | undefined;

  const nextAutoMessage =
    paymentReference && paymentReference.trim()
      ? autoMessage
      : `${AUTO_PAYMENT_PREFIX}Processing`;

  if (existingPaymentMessage?.id) {
    const currentMessage = (existingPaymentMessage.message || '').trim();
    const currentReference = currentMessage.startsWith(AUTO_PAYMENT_PREFIX)
      ? currentMessage.slice(AUTO_PAYMENT_PREFIX.length).trim()
      : '';
    const currentIsExact = isExactPaymentId(currentReference);
    const incomingIsExact = isExactPaymentId(paymentReference);

    // Never downgrade an exact pay_ reference to a non-exact one.
    if (currentIsExact && !incomingIsExact) {
      return;
    }

    if (currentMessage !== nextAutoMessage) {
      const { error: messageUpdateError } = await supabase
        .from('tbl_reservation_messages')
        .update({ message: nextAutoMessage })
        .eq('id', existingPaymentMessage.id);

      if (messageUpdateError) {
        throw new Error(
          messageUpdateError.message || 'Failed to update payment reference message.'
        );
      }
    }
    return;
  }

  const { error: messageInsertError } = await supabase
    .from('tbl_reservation_messages')
    .insert({
      reservation_id: reservationId,
      sender_type: 'passenger',
      sender_name: reservation.full_name || 'Passenger',
      message: nextAutoMessage,
    });

  if (messageInsertError) {
    throw new Error(
      messageInsertError.message || 'Failed to save payment reference message.'
    );
  }
}

export async function listReservationsByOperator(
  operatorUserId: string,
  limit = 120
) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('tbl_reservations')
    .select(
      'id, full_name, contact_number, pickup_location, route, seat_count, amount_due, status, created_at, paid_at'
    )
    .eq('operator_user_id', operatorUserId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message || 'Failed to fetch operator reservations.');
  return data || [];
}

export async function updateReservationStatusByOperator(input: {
  reservationId: string;
  operatorUserId: string;
  status: 'confirmed' | 'rejected';
}) {
  const supabase = getServiceClient();

  const { data: rows, error } = await supabase
    .from('tbl_reservations')
    .update({
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.reservationId)
    .eq('operator_user_id', input.operatorUserId)
    .in('status', ['pending_payment', 'pending_operator_approval', 'paid'])
    .select('id, status')
    .limit(1);

  if (error) throw new Error(error.message || 'Failed to update reservation status.');
  if (!rows?.[0]) throw new Error('Reservation not found or status cannot be changed.');

  if (input.status === 'confirmed') {
    const { error: lockError } = await supabase
      .from('tbl_seat_locks')
      .update({
        status: 'reserved',
        expires_at: null,
      })
      .eq('reservation_id', input.reservationId)
      .in('status', ['locked', 'reserved']);

    if (lockError) {
      throw new Error(lockError.message || 'Failed to reserve seats.');
    }
  } else if (input.status === 'rejected') {
    const { error: lockDeleteError } = await supabase
      .from('tbl_seat_locks')
      .delete()
      .eq('reservation_id', input.reservationId)
      .in('status', ['locked', 'reserved']);

    if (lockDeleteError) {
      throw new Error(lockDeleteError.message || 'Failed to release seats.');
    }
  }

  return rows[0];
}

export async function releaseReservationLocks(reservationId: string) {
  const supabase = getServiceClient();
  await supabase
    .from('tbl_seat_locks')
    .delete()
    .eq('reservation_id', reservationId)
    .eq('status', 'locked');

  await supabase
    .from('tbl_reservations')
    .update({ status: 'cancelled' })
    .eq('id', reservationId)
    .eq('status', 'pending_payment');
}

export async function getTripSeatStatuses(tripKey: string) {
  const supabase = getServiceClient();
  const nowIso = new Date().toISOString();

  await supabase
    .from('tbl_seat_locks')
    .delete()
    .lt('expires_at', nowIso)
    .eq('status', 'locked');

  const { data, error } = await supabase
    .from('tbl_seat_locks')
    .select('seat_label, status, expires_at')
    .eq('trip_key', tripKey)
    .in('status', ['locked', 'reserved']);

  if (error) {
    throw new Error(error.message || 'Failed to fetch trip seat statuses.');
  }

  const lockedSeats: string[] = [];
  const reservedSeats: string[] = [];

  for (const row of data || []) {
    if (row.status === 'reserved') {
      reservedSeats.push(row.seat_label);
      continue;
    }
    if (row.status === 'locked' && row.expires_at && row.expires_at > nowIso) {
      lockedSeats.push(row.seat_label);
    }
  }

  return {
    tripKey,
    lockedSeats,
    reservedSeats,
  };
}

export interface OperatorSeatMapItem {
  seatLabel: string;
  status: 'available' | 'locked' | 'reserved';
  passengerName: string | null;
  reservationId: string | null;
  source: 'reservation' | 'walk_in' | null;
}

const VAN_SEAT_LABELS = Array.from({ length: 14 }, (_, idx) => String(idx + 1));

const normalizeSeatLabel = (value: string) => value.trim();

export async function getOperatorTripSeatMap(input: {
  operatorUserId: string;
  tripKey: string;
}) {
  const supabase = getServiceClient();
  const nowIso = new Date().toISOString();

  await supabase
    .from('tbl_seat_locks')
    .delete()
    .lt('expires_at', nowIso)
    .eq('status', 'locked');

  const { data: lockRows, error: lockError } = await supabase
    .from('tbl_seat_locks')
    .select('reservation_id, seat_label, status, expires_at')
    .eq('trip_key', input.tripKey)
    .in('status', ['locked', 'reserved']);

  if (lockError) {
    throw new Error(lockError.message || 'Failed to load seat locks.');
  }

  const reservationIds = Array.from(
    new Set((lockRows || []).map((row: any) => row.reservation_id).filter(Boolean))
  );

  const reservationsById = new Map<string, any>();
  if (reservationIds.length > 0) {
    const { data: reservationRows, error: reservationError } = await supabase
      .from('tbl_reservations')
      .select('id, full_name, operator_user_id, pickup_location, payment_id')
      .in('id', reservationIds)
      .eq('operator_user_id', input.operatorUserId);

    if (reservationError) {
      throw new Error(reservationError.message || 'Failed to load reservations.');
    }

    for (const row of reservationRows || []) {
      reservationsById.set(row.id, row);
    }
  }

  const bySeat = new Map<string, OperatorSeatMapItem>();
  for (const label of VAN_SEAT_LABELS) {
    bySeat.set(label, {
      seatLabel: label,
      status: 'available',
      passengerName: null,
      reservationId: null,
      source: null,
    });
  }

  for (const lock of lockRows || []) {
    const seatLabel = normalizeSeatLabel(String(lock.seat_label || ''));
    if (!bySeat.has(seatLabel)) continue;
    const reservation = reservationsById.get(lock.reservation_id);
    if (!reservation) continue;

    const isWalkIn =
      (reservation.pickup_location || '').toUpperCase() === 'WALK_IN' ||
      (reservation.payment_id || '').toLowerCase() === 'walk_in';

    bySeat.set(seatLabel, {
      seatLabel,
      status: lock.status === 'locked' ? 'locked' : 'reserved',
      passengerName: reservation.full_name || null,
      reservationId: reservation.id || null,
      source: isWalkIn ? 'walk_in' : 'reservation',
    });
  }

  return {
    tripKey: input.tripKey,
    seats: VAN_SEAT_LABELS.map((label) => bySeat.get(label)!),
  };
}

export async function assignWalkInSeat(input: {
  operatorUserId: string;
  route: string;
  tripKey: string;
  seatLabel: string;
  passengerName: string;
  queueId?: string | null;
}) {
  const supabase = getServiceClient();
  const nowIso = new Date().toISOString();
  const seatLabel = normalizeSeatLabel(input.seatLabel);

  if (!VAN_SEAT_LABELS.includes(seatLabel)) {
    throw new Error('Invalid seat label.');
  }

  await supabase
    .from('tbl_seat_locks')
    .delete()
    .lt('expires_at', nowIso)
    .eq('status', 'locked');

  const { data: existingLocks, error: lockFetchError } = await supabase
    .from('tbl_seat_locks')
    .select('id')
    .eq('trip_key', input.tripKey)
    .eq('seat_label', seatLabel)
    .in('status', ['locked', 'reserved'])
    .limit(1);

  if (lockFetchError) {
    throw new Error(lockFetchError.message || 'Failed to validate seat.');
  }
  if ((existingLocks || []).length > 0) {
    throw new Error(`Seat ${seatLabel} is already occupied.`);
  }

  const { data: reservationRows, error: reservationError } = await supabase
    .from('tbl_reservations')
    .insert({
      full_name: input.passengerName.trim(),
      contact_number: 'WALK-IN',
      pickup_location: 'WALK_IN',
      route: input.route,
      seat_labels: [seatLabel],
      seat_count: 1,
      amount_due: 0,
      status: 'confirmed',
      payment_id: 'walk_in',
      paid_at: nowIso,
      trip_key: input.tripKey,
      queue_id: input.queueId || null,
      operator_user_id: input.operatorUserId,
      lock_expires_at: null,
      guest_token: createGuestToken(),
      updated_at: nowIso,
    })
    .select('id')
    .limit(1);

  if (reservationError || !reservationRows?.[0]) {
    throw new Error(reservationError?.message || 'Failed to create walk-in seat reservation.');
  }

  const reservationId = reservationRows[0].id as string;

  const { error: lockInsertError } = await supabase.from('tbl_seat_locks').insert({
    reservation_id: reservationId,
    trip_key: input.tripKey,
    seat_label: seatLabel,
    status: 'reserved',
    expires_at: null,
  });

  if (lockInsertError) {
    await supabase.from('tbl_reservations').delete().eq('id', reservationId);
    throw new Error(lockInsertError.message || 'Failed to occupy seat.');
  }

  return {
    reservationId,
    seatLabel,
  };
}

export async function releaseWalkInSeat(input: {
  operatorUserId: string;
  tripKey: string;
  seatLabel: string;
}) {
  const supabase = getServiceClient();
  const seatLabel = normalizeSeatLabel(input.seatLabel);

  if (!VAN_SEAT_LABELS.includes(seatLabel)) {
    throw new Error('Invalid seat label.');
  }

  const { data: lockRows, error: lockError } = await supabase
    .from('tbl_seat_locks')
    .select('id, reservation_id')
    .eq('trip_key', input.tripKey)
    .eq('seat_label', seatLabel)
    .eq('status', 'reserved')
    .limit(1);

  if (lockError) {
    throw new Error(lockError.message || 'Failed to load seat lock.');
  }
  const lock = lockRows?.[0];
  if (!lock) {
    throw new Error('Seat is not occupied.');
  }

  const { data: reservationRows, error: reservationError } = await supabase
    .from('tbl_reservations')
    .select('id, payment_id, pickup_location')
    .eq('id', lock.reservation_id)
    .eq('operator_user_id', input.operatorUserId)
    .limit(1);

  if (reservationError) {
    throw new Error(reservationError.message || 'Failed to load walk-in reservation.');
  }

  const reservation = reservationRows?.[0];
  if (!reservation) {
    throw new Error('Seat is not owned by this operator.');
  }

  const isWalkIn =
    (reservation.pickup_location || '').toUpperCase() === 'WALK_IN' ||
    (reservation.payment_id || '').toLowerCase() === 'walk_in';
  if (!isWalkIn) {
    throw new Error('Only walk-in occupied seats can be released manually.');
  }

  const nowIso = new Date().toISOString();
  const { error: reservationUpdateError } = await supabase
    .from('tbl_reservations')
    .update({
      status: 'cancelled',
      updated_at: nowIso,
    })
    .eq('id', reservation.id);

  if (reservationUpdateError) {
    throw new Error(reservationUpdateError.message || 'Failed to update reservation.');
  }

  const { error: lockDeleteError } = await supabase
    .from('tbl_seat_locks')
    .delete()
    .eq('id', lock.id);

  if (lockDeleteError) {
    throw new Error(lockDeleteError.message || 'Failed to release seat.');
  }

  return { seatLabel };
}
