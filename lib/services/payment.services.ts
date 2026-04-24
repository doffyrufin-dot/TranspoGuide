import { http } from '@/lib/http/client';

export interface CreateCheckoutPayload {
  amount: number;
  seatLabels: string;
  fullName: string;
  passengerEmail: string;
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
  passengerEmail: string;
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
  occupied_seats: string[];
}

export interface ReservationStatusPayload {
  id: string;
  full_name: string;
  passenger_email?: string | null;
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

export interface ReservationOperatorFeedback {
  id: string;
  reservation_id: string;
  operator_user_id: string;
  commuter_name: string | null;
  commuter_email: string | null;
  rating: number;
  feedback: string | null;
  created_at: string;
}

export interface ReservationStatusResult {
  reservation: ReservationStatusPayload;
  operator: { name: string; email: string } | null;
  messages: ReservationMessage[];
  feedback: ReservationOperatorFeedback | null;
}

export async function createReservationIntent(
  payload: CreateReservationIntentPayload
): Promise<ReservationIntentResult> {
  const { data } = await http.post<ReservationIntentResult>(
    '/api/reservations/intent',
    payload
  );
  return data;
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
  const { data } = await http.get<ReservationStatusResult>(
    `/api/reservations/status?${params.toString()}`,
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  );
  return data;
}

export async function sendReservationMessage(input: {
  reservationId: string;
  reservationToken?: string;
  message: string;
  senderType: 'passenger' | 'operator';
  senderName: string;
}): Promise<ReservationMessage> {
  const { data } = await http.post<{ message: ReservationMessage }>(
    '/api/reservations/chat',
    input
  );
  return data.message;
}

export async function createCheckoutSession(
  payload: CreateCheckoutPayload
): Promise<string> {
  const { data } = await http.post<{ checkout_url: string }>(
    '/api/create-checkout',
    payload
  );
  return data.checkout_url;
}

export async function submitReservationOperatorFeedback(input: {
  reservationId: string;
  reservationToken: string;
  rating: number;
  feedback?: string;
}): Promise<ReservationOperatorFeedback> {
  const { data } = await http.post<{ feedback: ReservationOperatorFeedback }>(
    '/api/reservations/rating',
    input
  );
  return data.feedback;
}

export async function fetchPaymentHistory(): Promise<PaymentRecord[]> {
  const { data } = await http.get<{ payments?: PaymentRecord[] }>('/api/payments');
  return (data.payments || []) as PaymentRecord[];
}

export async function fetchTripSeatStatuses(
  tripKey: string,
  queueId?: string | null
): Promise<TripSeatStatusResult> {
  const params = new URLSearchParams({
    tripKey,
  });
  if (queueId) {
    params.set('queueId', queueId);
  }
  const { data } = await http.get<TripSeatStatusResult>(
    `/api/reservations/seats?${params.toString()}`,
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  );
  return data;
}
