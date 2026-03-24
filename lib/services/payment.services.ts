export interface CreateCheckoutPayload {
  amount: number;
  seatLabels: string;
  fullName: string;
  contactNumber: string;
  route: string;
  reservationId: string;
  operatorUserId?: string;
  queueId?: string;
}

export interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  source: string;
  paidAt: string | null;
  createdAt: string;
  metadata?: Record<string, string>;
}

export interface CreateReservationIntentPayload {
  fullName: string;
  contactNumber: string;
  pickupLocation: string;
  route: string;
  seatLabels: string[];
  amount: number;
  tripKey: string;
  queueId?: string;
  operatorUserId?: string;
}

export interface ReservationIntentResult {
  reservation_id: string;
  lock_expires_at: string;
  guest_token: string;
}

export interface TripSeatStatusResult {
  trip_key: string;
  locked_seats: string[];
  reserved_seats: string[];
}

export interface ReservationStatusPayload {
  id: string;
  full_name: string;
  contact_number: string;
  pickup_location: string;
  route: string;
  seat_labels: string[];
  seat_count: number;
  amount_due: number;
  status: string;
  payment_id: string | null;
  paid_at: string | null;
  created_at: string;
  operator_user_id: string | null;
  queue_id: string | null;
  updated_at?: string | null;
}

export interface ReservationMessage {
  id: string;
  sender_type: 'passenger' | 'operator';
  sender_name: string;
  message: string;
  created_at: string;
}

export interface ReservationStatusResult {
  reservation: ReservationStatusPayload;
  operator: { name: string; email: string } | null;
  messages: ReservationMessage[];
}

export async function createReservationIntent(
  payload: CreateReservationIntentPayload
): Promise<ReservationIntentResult> {
  const res = await fetch('/api/reservations/intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to create reservation.');
  }

  return data as ReservationIntentResult;
}

export async function fetchReservationStatus(
  reservationId: string,
  reservationToken?: string
): Promise<ReservationStatusResult> {
  const params = new URLSearchParams({
    reservationId,
  });
  if (reservationToken?.trim()) {
    params.set('reservationToken', reservationToken.trim());
  }
  const res = await fetch(
    `/api/reservations/status?${params.toString()}`
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch reservation status.');
  }
  return data as ReservationStatusResult;
}

export async function sendReservationMessage(input: {
  reservationId: string;
  reservationToken?: string;
  message: string;
  senderType: 'passenger' | 'operator';
  senderName: string;
}): Promise<ReservationMessage> {
  const res = await fetch('/api/reservations/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to send message.');
  }
  return data.message as ReservationMessage;
}

export async function createCheckoutSession(
  payload: CreateCheckoutPayload
): Promise<string> {
  const res = await fetch('/api/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Payment failed. Please try again.');
  }

  return data.checkout_url as string;
}

export async function fetchPaymentHistory(): Promise<PaymentRecord[]> {
  const res = await fetch('/api/payments');
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch payments.');
  }

  return (data.payments || []) as PaymentRecord[];
}

export async function fetchTripSeatStatuses(
  tripKey: string
): Promise<TripSeatStatusResult> {
  const res = await fetch(
    `/api/reservations/seats?tripKey=${encodeURIComponent(tripKey)}`,
    { cache: 'no-store' }
  );
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch seat statuses.');
  }

  return data as TripSeatStatusResult;
}
