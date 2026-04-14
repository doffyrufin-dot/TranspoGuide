import { http } from '@/lib/http/client';

export interface OperatorPaymentRecord {
  id: string;
  passenger: string;
  route: string;
  seats: number;
  amount: number;
  status: string;
  paymentId: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface OperatorReservationRecord {
  id: string;
  full_name: string;
  passenger_email?: string | null;
  contact_number: string;
  pickup_location: string;
  route: string;
  seat_labels?: string[] | null;
  seat_count: number;
  amount_due: number;
  status: string;
  payment_id?: string | null;
  created_at: string;
  paid_at: string | null;
  latest_message?: string | null;
  latest_message_at?: string | null;
  latest_message_sender?: 'passenger' | 'operator' | null;
}

export interface OperatorReservationMessage {
  id: string;
  sender_type: 'passenger' | 'operator';
  sender_name: string;
  message: string;
  created_at: string;
}

export interface OperatorBoardingPassenger {
  id: string;
  full_name: string;
  contact_number: string;
  pickup_location: string;
  route: string;
  seat_count: number;
  amount_due: number;
  status: string;
  created_at: string;
  paid_at: string | null;
}

export interface OperatorBoardingQueueInfo {
  id: string;
  route: string;
  plate_number: string;
  departure_time: string | null;
  status: string;
}

export interface OperatorPassengersResult {
  queue: OperatorBoardingQueueInfo | null;
  passengers: OperatorBoardingPassenger[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  activeTripKey?: string | null;
}

export interface OperatorUnreadChatThread {
  reservation_id: string;
  passenger_name: string;
  route: string;
  status: string;
  latest_at: string;
  unread_count: number;
}

export interface OperatorUnreadChatResult {
  unreadThreadCount: number;
  unreadThreads: OperatorUnreadChatThread[];
  unreadByReservation?: Record<string, number>;
}

export interface OperatorChatConversationsResult {
  conversations: OperatorReservationRecord[];
}

export interface OperatorPaymentHistoryResult {
  summary: {
    today: number;
    week: number;
    month: number;
  };
  payments: OperatorPaymentRecord[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface OperatorReservationListResult {
  pending: OperatorReservationRecord[];
  history: OperatorReservationRecord[];
}

export async function fetchOperatorPaymentHistory(
  accessToken: string,
  options?: { page?: number; pageSize?: number }
): Promise<OperatorPaymentHistoryResult> {
  const params = new URLSearchParams();
  if (options?.page && Number.isFinite(options.page)) {
    params.set('page', String(Math.max(1, Math.floor(options.page))));
  }
  if (options?.pageSize && Number.isFinite(options.pageSize)) {
    params.set('pageSize', String(Math.max(1, Math.floor(options.pageSize))));
  }

  const { data } = await http.get<OperatorPaymentHistoryResult>(
    `/api/operator/payments${params.toString() ? `?${params.toString()}` : ''}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Cache-Control': 'no-store',
      },
    }
  );
  return data;
}

export async function fetchOperatorReservations(
  accessToken: string
): Promise<OperatorReservationListResult> {
  const { data } = await http.get<OperatorReservationListResult>(
    '/api/operator/reservations',
    {
      timeout: 8000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Cache-Control': 'no-store',
      },
    }
  );
  return data;
}

export async function updateOperatorReservationStatus(input: {
  accessToken: string;
  reservationId: string;
  status: 'confirmed' | 'rejected' | 'picked_up';
}) {
  const { data } = await http.post(
    '/api/operator/reservations/status',
    {
      reservationId: input.reservationId,
      status: input.status,
    },
    {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
    }
  );
  return data;
}

export async function fetchOperatorReservationMessages(input: {
  accessToken: string;
  reservationId: string;
}): Promise<OperatorReservationMessage[]> {
  const params = new URLSearchParams({ reservationId: input.reservationId });
  const { data } = await http.get<{ messages?: OperatorReservationMessage[] }>(
    `/api/operator/reservations/chat?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Cache-Control': 'no-store',
      },
    }
  );
  return (data.messages || []) as OperatorReservationMessage[];
}

export async function sendOperatorReservationMessage(input: {
  accessToken: string;
  reservationId: string;
  senderName: string;
  message: string;
}): Promise<OperatorReservationMessage> {
  const { data } = await http.post<{ message: OperatorReservationMessage }>(
    '/api/operator/reservations/chat',
    {
      reservationId: input.reservationId,
      senderName: input.senderName,
      message: input.message,
    },
    {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
    }
  );
  return data.message;
}

export async function markOperatorReservationChatSeen(input: {
  accessToken: string;
  reservationId: string;
}) {
  const { data } = await http.patch(
    '/api/operator/reservations/chat',
    {
      reservationId: input.reservationId,
    },
    {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
    }
  );
  return data;
}

export async function fetchOperatorBoardingPassengers(
  accessToken: string,
  options?: { page?: number; pageSize?: number }
): Promise<OperatorPassengersResult> {
  const params = new URLSearchParams();
  if (options?.page && Number.isFinite(options.page)) {
    params.set('page', String(Math.max(1, Math.floor(options.page))));
  }
  if (options?.pageSize && Number.isFinite(options.pageSize)) {
    params.set('pageSize', String(Math.max(1, Math.floor(options.pageSize))));
  }

  const { data } = await http.get<OperatorPassengersResult>(
    `/api/operator/passengers${params.toString() ? `?${params.toString()}` : ''}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Cache-Control': 'no-store',
      },
    }
  );
  return data;
}

export async function fetchOperatorUnreadChatCount(
  accessToken: string
): Promise<OperatorUnreadChatResult> {
  const { data } = await http.get<OperatorUnreadChatResult>(
    '/api/operator/chat/unread',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Cache-Control': 'no-store',
      },
    }
  );
  return data;
}

export async function fetchOperatorChatConversations(
  accessToken: string
): Promise<OperatorChatConversationsResult> {
  const { data } = await http.get<OperatorChatConversationsResult>(
    '/api/operator/chat/conversations',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Cache-Control': 'no-store',
      },
    }
  );
  return data;
}
