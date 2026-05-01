import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';

export interface CreateReservationIntentInput {
  fullName: string;
  passengerEmail: string;
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
const PAYMENT_LOCK_MINUTES = Number(
  process.env.RESERVATION_PAYMENT_WINDOW_MINUTES || '15'
);
const AUTO_PAYMENT_PREFIX = 'Payment completed. Payment Reference: ';
const AUTO_DEPARTED_MESSAGE =
  'Van update: This trip has departed from the terminal.';

const buildAutoPaymentMessageId = (reservationId: string) => {
  const hash = createHash('sha256')
    .update(`auto-payment:${reservationId}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(
    12,
    16
  )}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
};

const buildAutoDepartedMessageId = (reservationId: string) => {
  const hash = createHash('sha256')
    .update(`auto-departed:${reservationId}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(
    12,
    16
  )}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
};

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

const paymentLockExpiresAtIso = () =>
  new Date(Date.now() + PAYMENT_LOCK_MINUTES * 60 * 1000).toISOString();

const isSeatLockActive = (
  row: { status?: string | null; expires_at?: string | null },
  nowIso: string
) => {
  const status = String(row.status || '').toLowerCase();
  if (status === 'reserved') return true;
  if (status !== 'locked') return false;
  return !!row.expires_at && row.expires_at > nowIso;
};

const cleanupExpiredLockedSeatRows = async (input: {
  supabase: any;
  tripKey: string;
  seatLabels: string[];
  nowIso: string;
}) => {
  if (input.seatLabels.length === 0) return;
  const { error } = await input.supabase
    .from('tbl_seat_locks')
    .delete()
    .eq('trip_key', input.tripKey)
    .eq('status', 'locked')
    .lt('expires_at', input.nowIso)
    .in('seat_label', input.seatLabels);

  if (error) {
    throw new Error(error.message || 'Failed to clean expired seat locks.');
  }
};

export async function createReservationIntent(input: CreateReservationIntentInput) {
  const supabase = getServiceClient();
  const seatLabels = Array.from(
    new Set(input.seatLabels.map((s) => s.trim()).filter(Boolean))
  );
  if (seatLabels.length === 0) {
    throw new Error('Please select at least one seat.');
  }

  const nowIso = new Date().toISOString();
  const { data: seatLockRows, error: lockFetchError } = await supabase
    .from('tbl_seat_locks')
    .select('reservation_id, seat_label, status, expires_at')
    .eq('trip_key', input.tripKey)
    .in('status', ['locked', 'reserved'])
    .in('seat_label', seatLabels);

  if (lockFetchError) {
    throw new Error(lockFetchError.message || 'Failed to check seat locks.');
  }

  let relevantActiveLocks = (seatLockRows || []).filter((row) =>
    isSeatLockActive(row, nowIso)
  );
  if (input.queueId && relevantActiveLocks.length > 0) {
    const reservationIds = Array.from(
      new Set(
        relevantActiveLocks
          .map((row) => row.reservation_id)
          .filter((id): id is string => !!id)
      )
    );

    if (reservationIds.length > 0) {
      const { data: reservationRows, error: reservationFilterError } = await supabase
        .from('tbl_reservations')
        .select('id')
        .in('id', reservationIds)
        .eq('queue_id', input.queueId);

      if (reservationFilterError) {
        throw new Error(
          reservationFilterError.message || 'Failed to filter active seat locks.'
        );
      }

      const relevantReservationIds = new Set(
        (reservationRows || []).map((row) => row.id).filter(Boolean)
      );
      relevantActiveLocks = relevantActiveLocks.filter(
        (row) => !!row.reservation_id && relevantReservationIds.has(row.reservation_id)
      );
    } else {
      relevantActiveLocks = [];
    }
  }

  if (relevantActiveLocks.length > 0) {
    const occupied = relevantActiveLocks.map((l) => l.seat_label).join(', ');
    throw new Error(`Seat(s) already occupied: ${occupied}`);
  }

  // Cleanup stale seat rows right before insert to avoid stale-lock conflicts.
  await cleanupExpiredLockedSeatRows({
    supabase,
    tripKey: input.tripKey,
    seatLabels,
    nowIso,
  });

  const { data: reservationRows, error: reservationError } = await supabase
    .from('tbl_reservations')
    .insert({
      full_name: input.fullName,
      passenger_email: input.passengerEmail || null,
      contact_number: input.contactNumber,
      pickup_location: input.pickupLocation,
      route: input.route,
      seat_labels: seatLabels,
      seat_count: seatLabels.length,
      amount_due: input.amount,
      status: 'pending_operator_approval',
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
    const code = String((lockInsertError as { code?: string })?.code || '');
    if (code === '23505') {
      throw new Error('Seat lock conflict detected. Please refresh and try again.');
    }
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
      'id, full_name, passenger_email, contact_number, pickup_location, route, seat_labels, seat_count, amount_due, status, payment_id, paid_at, created_at, operator_user_id, queue_id, guest_token, updated_at'
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
  const rows = (data || []) as Array<{
    id: string;
    sender_type: 'passenger' | 'operator';
    sender_name: string | null;
    message: string;
    created_at: string;
  }>;

  const autoPaymentRows = rows.filter((row) =>
    String(row.message || '').startsWith(AUTO_PAYMENT_PREFIX)
  );

  if (autoPaymentRows.length <= 1) {
    return rows;
  }

  const deterministicId = buildAutoPaymentMessageId(reservationId);
  const isExactPaymentReference = (value?: string | null) =>
    typeof value === 'string' && value.trim().startsWith('pay_');

  const preferredAutoRow =
    autoPaymentRows.find((row) => row.id === deterministicId) ||
    autoPaymentRows.find((row) => {
      const suffix = String(row.message || '')
        .slice(AUTO_PAYMENT_PREFIX.length)
        .trim();
      return isExactPaymentReference(suffix);
    }) ||
    autoPaymentRows
      .slice()
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

  const duplicateIds = autoPaymentRows
    .filter((row) => row.id !== preferredAutoRow.id)
    .map((row) => row.id)
    .filter(Boolean);

  if (duplicateIds.length > 0) {
    const { error: dedupeDeleteError } = await supabase
      .from('tbl_reservation_messages')
      .delete()
      .in('id', duplicateIds);

    if (dedupeDeleteError) {
      // Continue returning a deduped snapshot for the current response.
      console.warn(
        '[reservations] auto-payment message dedupe delete failed:',
        dedupeDeleteError.message || dedupeDeleteError
      );
    }
  }

  return rows.filter(
    (row) =>
      !(
        String(row.message || '').startsWith(AUTO_PAYMENT_PREFIX) &&
        row.id !== preferredAutoRow.id
      )
  );
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
  const nowMs = new Date(nowIso).getTime();
  const isExactPaymentId = (value?: string | null) =>
    typeof value === 'string' && value.trim().startsWith('pay_');

  const { data: reservationRows, error: reservationReadError } = await supabase
    .from('tbl_reservations')
    .select('id, full_name, payment_id, status, lock_expires_at')
    .eq('id', reservationId)
    .limit(1);

  if (reservationReadError) {
    throw new Error(reservationReadError.message || 'Failed to read reservation.');
  }

  const reservation = reservationRows?.[0];
  if (!reservation) {
    throw new Error('Reservation not found.');
  }
  const currentStatus = String((reservation as { status?: string | null }).status || '').toLowerCase();
  if (currentStatus === 'pending_operator_approval') {
    throw new Error('Reservation is still waiting for operator approval.');
  }
  if (
    currentStatus !== 'pending_payment' &&
    currentStatus !== 'confirmed' &&
    currentStatus !== 'paid'
  ) {
    throw new Error('Reservation status does not allow payment confirmation.');
  }

  const canonicalReservationId =
    String((reservation as { id?: string | null }).id || reservationId).trim() ||
    reservationId;

  if (currentStatus === 'pending_payment') {
    const { data: lockRows, error: lockReadError } = await supabase
      .from('tbl_seat_locks')
      .select('id, status, expires_at')
      .eq('reservation_id', reservationId)
      .in('status', ['locked', 'reserved']);

    if (lockReadError) {
      throw new Error(lockReadError.message || 'Failed to validate seat lock.');
    }

    const hasActiveLock = (lockRows || []).some((row: any) => {
      const status = String(row?.status || '').toLowerCase();
      if (status === 'reserved') return true;
      if (status !== 'locked') return false;
      const expiresAt = String(row?.expires_at || '').trim();
      const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : 0;
      return expiresAtMs > nowMs;
    });

    if (!hasActiveLock) {
      await releaseReservationLocks(canonicalReservationId);
      throw new Error(
        'Payment window expired for this reservation. Please reserve your seat again.'
      );
    }
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
      status: 'confirmed',
      payment_id: resolvedPaymentReference,
      paid_at: nowIso,
      lock_expires_at: null,
      updated_at: nowIso,
    })
    .eq('id', canonicalReservationId);

  if (reservationError) {
    throw new Error(reservationError.message || 'Failed to mark reservation as paid.');
  }

  const { error: lockError } = await supabase
    .from('tbl_seat_locks')
    .update({
      status: 'reserved',
      expires_at: null,
    })
    .eq('reservation_id', canonicalReservationId);

  if (lockError) {
    throw new Error(lockError.message || 'Failed to update seat lock status.');
  }

  const paymentReference = resolvedPaymentReference || '';
  const nextAutoMessage =
    paymentReference && paymentReference.trim()
      ? `${AUTO_PAYMENT_PREFIX}${paymentReference}`
      : `${AUTO_PAYMENT_PREFIX}Processing`;

  const autoPaymentMessageId = buildAutoPaymentMessageId(canonicalReservationId);
  const { data: deterministicMessageRows, error: deterministicReadError } =
    await supabase
      .from('tbl_reservation_messages')
      .select('id, message')
      .eq('id', autoPaymentMessageId)
      .limit(1);

  if (deterministicReadError) {
    throw new Error(
      deterministicReadError.message || 'Failed to verify payment reference message.'
    );
  }

  const existingDeterministicMessage = deterministicMessageRows?.[0] as
    | { id: string; message: string | null }
    | undefined;

  let messageToPersist = nextAutoMessage;
  if (existingDeterministicMessage?.message) {
    const currentMessage = String(existingDeterministicMessage.message || '').trim();
    const currentReference = currentMessage.startsWith(AUTO_PAYMENT_PREFIX)
      ? currentMessage.slice(AUTO_PAYMENT_PREFIX.length).trim()
      : '';
    const currentIsExact = isExactPaymentId(currentReference);
    const incomingIsExact = isExactPaymentId(paymentReference);

    // Never downgrade an exact pay_ reference to a non-exact one.
    if (currentIsExact && !incomingIsExact) {
      messageToPersist = currentMessage;
    }
  }

  const { data: existingAutoRows, error: existingAutoReadError } = await supabase
    .from('tbl_reservation_messages')
    .select('id, message')
    .eq('reservation_id', canonicalReservationId)
    .like('message', `${AUTO_PAYMENT_PREFIX}%`)
    .order('created_at', { ascending: true })
    .limit(50);

  if (existingAutoReadError) {
    throw new Error(
      existingAutoReadError.message || 'Failed to inspect payment reference messages.'
    );
  }

  const exactExistingMessage = (existingAutoRows || []).find((row) => {
    return String(row.message || '').trim() === messageToPersist.trim();
  }) as { id: string; message: string | null } | undefined;

  const messageRowIdToKeep = exactExistingMessage?.id || autoPaymentMessageId;

  const { error: messageUpsertError } = await supabase
    .from('tbl_reservation_messages')
    .upsert(
      {
        id: messageRowIdToKeep,
        reservation_id: canonicalReservationId,
        sender_type: 'passenger',
        sender_name: reservation.full_name || 'Passenger',
        message: messageToPersist,
      },
      { onConflict: 'id' }
    );

  if (messageUpsertError) {
    throw new Error(
      messageUpsertError.message || 'Failed to save payment reference message.'
    );
  }

  // Hard cleanup: keep only the deterministic auto-payment message row.
  const { data: duplicateRows, error: duplicateReadError } = await supabase
    .from('tbl_reservation_messages')
    .select('id')
    .eq('reservation_id', canonicalReservationId)
    .like('message', `${AUTO_PAYMENT_PREFIX}%`)
    .neq('id', messageRowIdToKeep);

  if (duplicateReadError) {
    throw new Error(
      duplicateReadError.message || 'Failed to validate payment message duplicates.'
    );
  }

  const duplicateIds = (duplicateRows || [])
    .map((row: { id?: string | null }) => row.id)
    .filter((id): id is string => !!id);

  if (duplicateIds.length > 0) {
    const { error: duplicateDeleteError } = await supabase
      .from('tbl_reservation_messages')
      .delete()
      .in('id', duplicateIds);

    if (duplicateDeleteError) {
      throw new Error(
        duplicateDeleteError.message || 'Failed to clean duplicate payment messages.'
      );
    }
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
      'id, full_name, passenger_email, contact_number, pickup_location, route, seat_labels, seat_count, amount_due, status, payment_id, created_at, paid_at'
    )
    .eq('operator_user_id', operatorUserId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message || 'Failed to fetch operator reservations.');
  return data || [];
}

export async function markReservationsDepartedForQueue(input: {
  queueId: string;
  operatorUserId: string;
  senderName?: string;
}) {
  const supabase = getServiceClient();
  const nowIso = new Date().toISOString();

  const { data: rows, error: readError } = await supabase
    .from('tbl_reservations')
    .select('id, full_name, passenger_email, route, seat_labels, seat_count')
    .eq('queue_id', input.queueId)
    .eq('operator_user_id', input.operatorUserId)
    .in('status', ['confirmed', 'pending_operator_approval', 'paid']);

  if (readError) {
    throw new Error(readError.message || 'Failed to load queue reservations.');
  }

  const reservations = (rows || []) as Array<{
    id: string;
    full_name: string | null;
    passenger_email: string | null;
    route: string | null;
    seat_labels: string[] | null;
    seat_count: number | null;
  }>;
  if (reservations.length === 0) {
    return { updatedCount: 0, reservations: [] };
  }

  const reservationIds = reservations.map((row) => row.id).filter(Boolean);
  let departedStatusSaved = false;

  const { error: departedUpdateError } = await supabase
    .from('tbl_reservations')
    .update({
      status: 'departed',
      updated_at: nowIso,
    })
    .in('id', reservationIds);

  if (departedUpdateError) {
    const departedErrorMessage = String(departedUpdateError.message || '').toLowerCase();
    const departedErrorCode = String((departedUpdateError as { code?: string }).code || '');
    const isStatusConstraintMismatch =
      departedErrorCode === '23514' ||
      departedErrorMessage.includes('tbl_reservations_status_check') ||
      departedErrorMessage.includes('violates check constraint');

    if (!isStatusConstraintMismatch) {
      throw new Error(
        departedUpdateError.message || 'Failed to mark reservations as departed.'
      );
    }

    const { error: timestampOnlyError } = await supabase
      .from('tbl_reservations')
      .update({
        updated_at: nowIso,
      })
      .in('id', reservationIds);

    if (timestampOnlyError) {
      throw new Error(
        timestampOnlyError.message || 'Failed to update queue reservations.'
      );
    }
  } else {
    departedStatusSaved = true;
  }

  const senderName = (input.senderName || '').trim() || 'Operator';
  const autoMessages = reservations.map((reservation) => ({
    id: buildAutoDepartedMessageId(reservation.id),
    reservation_id: reservation.id,
    sender_type: 'operator' as const,
    sender_name: senderName,
    message: AUTO_DEPARTED_MESSAGE,
  }));

  const { error: messageError } = await supabase
    .from('tbl_reservation_messages')
    .upsert(autoMessages, { onConflict: 'id' });

  if (messageError) {
    throw new Error(
      messageError.message || 'Failed to post departed notification messages.'
    );
  }

  return {
    updatedCount: reservations.length,
    reservations,
    departedStatusSaved,
  };
}

export async function updateReservationStatusByOperator(input: {
  reservationId: string;
  operatorUserId: string;
  status: 'confirmed' | 'rejected' | 'picked_up';
}) {
  const supabase = getServiceClient();
  const nextStatus = input.status === 'confirmed' ? 'pending_payment' : input.status;
  const nextPaymentLockExpiresAt =
    input.status === 'confirmed' ? paymentLockExpiresAtIso() : null;
  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };
  if (input.status === 'confirmed') {
    updatePayload.lock_expires_at = nextPaymentLockExpiresAt;
  }
  const allowedCurrentStatuses =
    input.status === 'picked_up'
      ? ['confirmed', 'pending_operator_approval', 'paid', 'departed']
      : ['pending_operator_approval'];

  if (input.status === 'picked_up') {
    const { data: reservationRows, error: reservationReadError } = await supabase
      .from('tbl_reservations')
      .select('id, queue_id, status')
      .eq('id', input.reservationId)
      .eq('operator_user_id', input.operatorUserId)
      .limit(1);

    if (reservationReadError) {
      throw new Error(
        reservationReadError.message || 'Failed to validate pickup status.'
      );
    }

    const reservation = reservationRows?.[0] as
      | { id: string; queue_id?: string | null; status?: string | null }
      | undefined;

    if (!reservation) {
      throw new Error('Reservation not found or status cannot be changed.');
    }

    const queueId = String(reservation.queue_id || '').trim();
    if (!queueId) {
      throw new Error('Pickup requires an active departed queue.');
    }

    const { data: queueRows, error: queueReadError } = await supabase
      .from('tbl_van_queue')
      .select('status')
      .eq('id', queueId)
      .eq('operator_user_id', input.operatorUserId)
      .limit(1);

    if (queueReadError) {
      throw new Error(queueReadError.message || 'Failed to validate queue status.');
    }

    const queueStatus = String(queueRows?.[0]?.status || '')
      .trim()
      .toLowerCase();
    if (queueStatus !== 'departed') {
      throw new Error(
        'Pickup can only be marked after the van is departed.'
      );
    }
  }

  const { data: rows, error } = await supabase
    .from('tbl_reservations')
    .update(updatePayload)
    .eq('id', input.reservationId)
    .eq('operator_user_id', input.operatorUserId)
    .in('status', allowedCurrentStatuses)
    .select(
      'id, status, full_name, passenger_email, route, seat_labels, seat_count, operator_user_id, queue_id'
    )
    .limit(1);

  if (error) throw new Error(error.message || 'Failed to update reservation status.');
  if (!rows?.[0]) throw new Error('Reservation not found or status cannot be changed.');

  if (input.status === 'confirmed') {
    const lockExpiryValue = nextPaymentLockExpiresAt || paymentLockExpiresAtIso();
    const { error: lockError } = await supabase
      .from('tbl_seat_locks')
      .update({
        status: 'locked',
        expires_at: lockExpiryValue,
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
  } else if (input.status === 'picked_up') {
    const { error: messageDeleteError } = await supabase
      .from('tbl_reservation_messages')
      .delete()
      .eq('reservation_id', input.reservationId);

    if (messageDeleteError) {
      throw new Error(messageDeleteError.message || 'Failed to clear reservation chat.');
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
    .in('status', ['locked', 'reserved']);

  await supabase
    .from('tbl_reservations')
    .update({ status: 'cancelled' })
    .eq('id', reservationId)
    .eq('status', 'pending_payment');
}

export async function getTripSeatStatuses(tripKey: string, queueId?: string | null) {
  const supabase = getServiceClient();
  const nowIso = new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();

  const { data, error } = await supabase
    .from('tbl_seat_locks')
    .select('id, reservation_id, seat_label, status, expires_at')
    .eq('trip_key', tripKey)
    .in('status', ['locked', 'reserved']);

  if (error) {
    throw new Error(error.message || 'Failed to fetch trip seat statuses.');
  }

  let relevantRows = data || [];
  const reservationIds = Array.from(
    new Set(
      relevantRows
        .map((row) => row.reservation_id)
        .filter((id): id is string => !!id)
    )
  );

  let reservationRows: Array<{
    id: string;
    pickup_location: string | null;
    payment_id: string | null;
    status: string | null;
    lock_expires_at: string | null;
  }> = [];

  if (reservationIds.length > 0) {
    let reservationQuery = supabase
      .from('tbl_reservations')
      .select('id, pickup_location, payment_id, status, lock_expires_at')
      .in('id', reservationIds);

    if (queueId) {
      reservationQuery = reservationQuery.eq('queue_id', queueId);
    }

    const { data: fetchedReservationRows, error: reservationFilterError } =
      await reservationQuery;

    if (reservationFilterError) {
      throw new Error(
        reservationFilterError.message || 'Failed to filter seat statuses by queue.'
      );
    }

    reservationRows = (fetchedReservationRows || []) as Array<{
      id: string;
      pickup_location: string | null;
      payment_id: string | null;
      status: string | null;
      lock_expires_at: string | null;
    }>;

    const relevantReservationIds = new Set(
      reservationRows.map((row) => row.id).filter(Boolean)
    );
    relevantRows = relevantRows.filter(
      (row) => !!row.reservation_id && relevantReservationIds.has(row.reservation_id)
    );
  } else {
    relevantRows = [];
  }

  const lockedSeats: string[] = [];
  const reservedSeats: string[] = [];
  const occupiedSeats: string[] = [];
  const reservationById = new Map(
    reservationRows.map((row) => [row.id, row] as const)
  );
  const walkInReservationIds = new Set(
    reservationRows
      .filter((row) => {
        const pickup = (row.pickup_location || '').toUpperCase();
        const paymentId = (row.payment_id || '').toLowerCase();
        return pickup === 'WALK_IN' || isWalkInPaymentId(paymentId);
      })
      .map((row) => row.id)
      .filter(Boolean)
  );

  const demoteToLockedIds: string[] = [];
  const releaseLockIds: string[] = [];

  for (const row of relevantRows) {
    const reservation = row.reservation_id
      ? reservationById.get(row.reservation_id)
      : undefined;
    if (row.status === 'reserved') {
      if (row.reservation_id && walkInReservationIds.has(row.reservation_id)) {
        occupiedSeats.push(row.seat_label);
      } else {
        const isPaid =
          reservation && isPaidReservationStatus(reservation.status || null);
        if (isPaid) {
          reservedSeats.push(row.seat_label);
          continue;
        }

        const fallbackExpiry = String(
          reservation?.lock_expires_at || row.expires_at || ''
        ).trim();
        const fallbackExpiryMs = fallbackExpiry
          ? new Date(fallbackExpiry).getTime()
          : 0;

        if (fallbackExpiryMs > nowMs) {
          lockedSeats.push(row.seat_label);
          if (row.id) demoteToLockedIds.push(row.id);
        } else if (row.id) {
          releaseLockIds.push(row.id);
        }
      }
      continue;
    }
    if (row.status === 'locked' && row.expires_at && row.expires_at > nowIso) {
      lockedSeats.push(row.seat_label);
    }
  }

  if (demoteToLockedIds.length > 0) {
    const updateIso = new Date(
      Date.now() + PAYMENT_LOCK_MINUTES * 60 * 1000
    ).toISOString();
    const { error: demoteError } = await supabase
      .from('tbl_seat_locks')
      .update({ status: 'locked', expires_at: updateIso })
      .in('id', demoteToLockedIds);
    if (demoteError) {
      console.warn(
        '[seat-statuses] Failed to demote unpaid reserved locks:',
        demoteError.message || demoteError
      );
    }
  }

  if (releaseLockIds.length > 0) {
    const { error: releaseError } = await supabase
      .from('tbl_seat_locks')
      .delete()
      .in('id', releaseLockIds);
    if (releaseError) {
      console.warn(
        '[seat-statuses] Failed to release expired unpaid reserved locks:',
        releaseError.message || releaseError
      );
    }
  }

  return {
    tripKey,
    lockedSeats,
    reservedSeats,
    occupiedSeats,
  };
}

export interface OperatorSeatMapItem {
  seatLabel: string;
  status: 'available' | 'locked' | 'reserved';
  passengerName: string | null;
  reservationId: string | null;
  source: 'reservation' | 'walk_in' | null;
  walkInDiscounted?: boolean;
}

const VAN_SEAT_LABELS = Array.from({ length: 14 }, (_, idx) => String(idx + 1));

const normalizeSeatLabel = (value: string) => value.trim();

const isWalkInPaymentId = (value?: string | null) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .startsWith('walk_in');

const isPaidReservationStatus = (value?: string | null) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return (
    normalized === 'confirmed' ||
    normalized === 'paid' ||
    normalized === 'departed' ||
    normalized === 'picked_up'
  );
};

const normalizeRouteParts = (route: string) => {
  const raw = String(route || '').trim();
  if (!raw) {
    return {
      raw: '',
      origin: '',
      destination: '',
    };
  }

  const normalizedArrow = raw
    .replace(/\s*->\s*/g, '|')
    .replace(/\s*-\s*/g, '|')
    .replace(/\s+to\s+/gi, '|');

  const parts = normalizedArrow
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      raw,
      origin: parts[0],
      destination: parts[parts.length - 1],
    };
  }

  return {
    raw,
    origin: '',
    destination: parts[0] || raw,
  };
};

const resolveWalkInFare = async (input: {
  supabase: any;
  route: string;
  isDiscounted: boolean;
}) => {
  const routeParts = normalizeRouteParts(input.route);
  const candidates = Array.from(
    new Set([routeParts.destination, routeParts.raw].filter(Boolean))
  );

  const pickBestFareRow = (rows: any[]) => {
    if (!rows?.length) return null;
    const vanRow =
      rows.find((row) =>
        String(row.vehicle_type || '')
          .toLowerCase()
          .includes('van')
      ) || null;
    return vanRow || rows[0];
  };

  let chosenRow: any = null;

  if (routeParts.origin && routeParts.destination) {
    const { data: exactRows, error: exactError } = await input.supabase
      .from('tbl_route_fares')
      .select('regular_fare, discount_rate, vehicle_type')
      .eq('is_active', true)
      .ilike('origin', routeParts.origin)
      .ilike('destination', routeParts.destination)
      .limit(50);

    if (exactError) {
      throw new Error(exactError.message || 'Failed to resolve walk-in fare.');
    }
    chosenRow = pickBestFareRow(exactRows || []);
  }

  if (!chosenRow) {
    for (const destination of candidates) {
      const { data: rows, error } = await input.supabase
        .from('tbl_route_fares')
        .select('regular_fare, discount_rate, vehicle_type')
        .eq('is_active', true)
        .ilike('destination', destination)
        .limit(50);

      if (error) {
        throw new Error(error.message || 'Failed to resolve walk-in fare.');
      }
      chosenRow = pickBestFareRow(rows || []);
      if (chosenRow) break;
    }
  }

  const regularFare = Number(chosenRow?.regular_fare || 0);
  if (!Number.isFinite(regularFare) || regularFare <= 0) {
    return {
      amountDue: 0,
      regularFare: 0,
      discountRate: 0,
    };
  }

  const rawDiscountRate = Number(chosenRow?.discount_rate || 0);
  const discountRate = Math.min(Math.max(rawDiscountRate, 0), 1);
  const amountDue = input.isDiscounted
    ? regularFare * (1 - discountRate)
    : regularFare;

  return {
    amountDue: Number(amountDue.toFixed(2)),
    regularFare: Number(regularFare.toFixed(2)),
    discountRate,
  };
};

export async function getOperatorTripSeatMap(input: {
  operatorUserId: string;
  tripKey: string;
  queueId?: string | null;
}) {
  const supabase = getServiceClient();
  const nowIso = new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();

  const { data: lockRows, error: lockError } = await supabase
    .from('tbl_seat_locks')
    .select('id, reservation_id, seat_label, status, expires_at')
    .eq('trip_key', input.tripKey)
    .in('status', ['locked', 'reserved']);

  if (lockError) {
    throw new Error(lockError.message || 'Failed to load seat locks.');
  }

  const activeSeatLocks = (lockRows || []).filter((row: any) =>
    isSeatLockActive(row, nowIso)
  );

  const reservationIds = Array.from(
    new Set(activeSeatLocks.map((row: any) => row.reservation_id).filter(Boolean))
  );

  const reservationsById = new Map<string, any>();
  if (reservationIds.length > 0) {
    let reservationQuery = supabase
      .from('tbl_reservations')
      .select(
        'id, full_name, operator_user_id, pickup_location, payment_id, status, lock_expires_at'
      )
      .in('id', reservationIds)
      .eq('operator_user_id', input.operatorUserId);
    if (input.queueId) {
      reservationQuery = reservationQuery.eq('queue_id', input.queueId);
    }
    const { data: reservationRows, error: reservationError } = await reservationQuery;

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

  const demoteToLocked: Array<{ id: string; expiresAt: string }> = [];
  const releaseLockIds: string[] = [];

  for (const lock of activeSeatLocks) {
    const seatLabel = normalizeSeatLabel(String(lock.seat_label || ''));
    if (!bySeat.has(seatLabel)) continue;
    const reservation = reservationsById.get(lock.reservation_id);
    if (!reservation) continue;

    const isWalkIn =
      (reservation.pickup_location || '').toUpperCase() === 'WALK_IN' ||
      isWalkInPaymentId(reservation.payment_id);
    const paymentIdLower = String(reservation.payment_id || '')
      .trim()
      .toLowerCase();
    const walkInDiscounted = paymentIdLower.startsWith('walk_in_discounted');
    const isPaidReservation = isPaidReservationStatus(reservation.status || null);

    let effectiveSeatStatus: 'locked' | 'reserved' =
      lock.status === 'locked' ? 'locked' : 'reserved';
    let shouldDemoteReservedLock = false;
    let shouldReleaseReservedLock = false;

    if (!isWalkIn && lock.status === 'reserved' && !isPaidReservation) {
      const fallbackExpiry = String(
        reservation.lock_expires_at || lock.expires_at || ''
      ).trim();
      const fallbackExpiryMs = fallbackExpiry
        ? new Date(fallbackExpiry).getTime()
        : 0;
      if (fallbackExpiryMs > nowMs) {
        effectiveSeatStatus = 'locked';
        shouldDemoteReservedLock = true;
      } else {
        shouldReleaseReservedLock = true;
      }
    }

    if (shouldReleaseReservedLock) {
      if (lock.id) releaseLockIds.push(lock.id);
      continue;
    }

    bySeat.set(seatLabel, {
      seatLabel,
      status: effectiveSeatStatus,
      passengerName: reservation.full_name || null,
      reservationId: reservation.id || null,
      source: isWalkIn ? 'walk_in' : 'reservation',
      walkInDiscounted,
    });

    if (shouldDemoteReservedLock && lock.id) {
      const lockExpiryValue = String(
        reservation.lock_expires_at || paymentLockExpiresAtIso()
      ).trim();
      demoteToLocked.push({
        id: lock.id,
        expiresAt: lockExpiryValue,
      });
    }
  }

  if (demoteToLocked.length > 0) {
    for (const item of demoteToLocked) {
      const { error: demoteError } = await supabase
        .from('tbl_seat_locks')
        .update({
          status: 'locked',
          expires_at: item.expiresAt,
        })
        .eq('id', item.id);
      if (demoteError) {
        console.warn(
          '[operator-seat-map] Failed to demote unpaid reserved lock:',
          demoteError.message || demoteError
        );
      }
    }
  }

  if (releaseLockIds.length > 0) {
    const { error: releaseError } = await supabase
      .from('tbl_seat_locks')
      .delete()
      .in('id', releaseLockIds);
    if (releaseError) {
      console.warn(
        '[operator-seat-map] Failed to release expired unpaid reserved lock:',
        releaseError.message || releaseError
      );
    }
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
  isDiscounted?: boolean;
  queueId?: string | null;
}) {
  const supabase = getServiceClient();
  const nowIso = new Date().toISOString();
  const seatLabel = normalizeSeatLabel(input.seatLabel);
  const isDiscounted = !!input.isDiscounted;

  if (!VAN_SEAT_LABELS.includes(seatLabel)) {
    throw new Error('Invalid seat label.');
  }

  const { data: existingLocks, error: lockFetchError } = await supabase
    .from('tbl_seat_locks')
    .select('id, status, expires_at')
    .eq('trip_key', input.tripKey)
    .eq('seat_label', seatLabel)
    .in('status', ['locked', 'reserved']);

  if (lockFetchError) {
    throw new Error(lockFetchError.message || 'Failed to validate seat.');
  }

  const activeLocks = (existingLocks || []).filter((row: any) =>
    isSeatLockActive(row, nowIso)
  );
  if (activeLocks.length > 0) {
    throw new Error(`Seat ${seatLabel} is already occupied.`);
  }

  await cleanupExpiredLockedSeatRows({
    supabase,
    tripKey: input.tripKey,
    seatLabels: [seatLabel],
    nowIso,
  });

  const fare = await resolveWalkInFare({
    supabase,
    route: input.route,
    isDiscounted,
  });
  const walkInPaymentId = isDiscounted ? 'walk_in_discounted' : 'walk_in';

  const { data: reservationRows, error: reservationError } = await supabase
    .from('tbl_reservations')
    .insert({
      full_name: input.passengerName.trim(),
      contact_number: 'WALK-IN',
      pickup_location: 'WALK_IN',
      route: input.route,
      seat_labels: [seatLabel],
      seat_count: 1,
      amount_due: fare.amountDue,
      status: 'confirmed',
      payment_id: walkInPaymentId,
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
  queueId?: string | null;
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

  let reservationQuery = supabase
    .from('tbl_reservations')
    .select('id, payment_id, pickup_location')
    .eq('id', lock.reservation_id)
    .eq('operator_user_id', input.operatorUserId);
  if (input.queueId) {
    reservationQuery = reservationQuery.eq('queue_id', input.queueId);
  }
  const { data: reservationRows, error: reservationError } = await reservationQuery.limit(1);

  if (reservationError) {
    throw new Error(reservationError.message || 'Failed to load walk-in reservation.');
  }

  const reservation = reservationRows?.[0];
  if (!reservation) {
    throw new Error('Seat is not owned by this operator.');
  }

  const isWalkIn =
    (reservation.pickup_location || '').toUpperCase() === 'WALK_IN' ||
    isWalkInPaymentId(reservation.payment_id);
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
