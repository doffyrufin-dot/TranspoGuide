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
  contact_number: string;
  pickup_location: string;
  route: string;
  seat_count: number;
  amount_due: number;
  status: string;
  created_at: string;
  paid_at: string | null;
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
}

export interface OperatorUnreadChatThread {
  reservation_id: string;
  passenger_name: string;
  route: string;
  status: string;
  latest_at: string;
}

export interface OperatorUnreadChatResult {
  unreadThreadCount: number;
  unreadThreads: OperatorUnreadChatThread[];
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
}

export interface OperatorReservationListResult {
  pending: OperatorReservationRecord[];
  history: OperatorReservationRecord[];
}

export async function fetchOperatorPaymentHistory(
  accessToken: string
): Promise<OperatorPaymentHistoryResult> {
  const res = await fetch('/api/operator/payments', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch operator payment history.');
  }

  return data as OperatorPaymentHistoryResult;
}

export async function fetchOperatorReservations(
  accessToken: string
): Promise<OperatorReservationListResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  const res = await fetch('/api/operator/reservations', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
    signal: controller.signal,
  });
  window.clearTimeout(timeout);

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch operator reservations.');
  }

  return data as OperatorReservationListResult;
}

export async function updateOperatorReservationStatus(input: {
  accessToken: string;
  reservationId: string;
  status: 'confirmed' | 'rejected';
}) {
  const res = await fetch('/api/operator/reservations/status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      reservationId: input.reservationId,
      status: input.status,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update reservation.');
  }

  return data;
}

export async function fetchOperatorReservationMessages(input: {
  accessToken: string;
  reservationId: string;
}): Promise<OperatorReservationMessage[]> {
  const params = new URLSearchParams({ reservationId: input.reservationId });
  const res = await fetch(`/api/operator/reservations/chat?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
    cache: 'no-store',
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch reservation chat.');
  }

  return (data.messages || []) as OperatorReservationMessage[];
}

export async function sendOperatorReservationMessage(input: {
  accessToken: string;
  reservationId: string;
  senderName: string;
  message: string;
}): Promise<OperatorReservationMessage> {
  const res = await fetch('/api/operator/reservations/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      reservationId: input.reservationId,
      senderName: input.senderName,
      message: input.message,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to send reservation chat message.');
  }

  return data.message as OperatorReservationMessage;
}

export async function fetchOperatorBoardingPassengers(
  accessToken: string
): Promise<OperatorPassengersResult> {
  const res = await fetch('/api/operator/passengers', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to load boarding passengers.');
  }

  return data as OperatorPassengersResult;
}

export async function fetchOperatorUnreadChatCount(
  accessToken: string
): Promise<OperatorUnreadChatResult> {
  const res = await fetch('/api/operator/chat/unread', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to load unread chat count.');
  }

  return data as OperatorUnreadChatResult;
}

export async function fetchOperatorChatConversations(
  accessToken: string
): Promise<OperatorChatConversationsResult> {
  const res = await fetch('/api/operator/chat/conversations', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to load chat conversations.');
  }

  return data as OperatorChatConversationsResult;
}
