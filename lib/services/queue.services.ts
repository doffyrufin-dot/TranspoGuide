export interface QueueEntry {
  id: string;
  operatorUserId: string;
  plate: string;
  driver: string;
  operatorName: string;
  operatorEmail: string;
  route: string;
  departure: string;
  status: string;
  position: number;
}

export async function fetchActiveQueue(route?: string): Promise<QueueEntry[]> {
  const params = new URLSearchParams();
  if (route?.trim()) params.set('route', route.trim());

  const res = await fetch(
    `/api/queue/active${params.toString() ? `?${params}` : ''}`
  );
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch queue.');
  }

  return (data.queue || []) as QueueEntry[];
}
