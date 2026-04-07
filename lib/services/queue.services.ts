import { http } from '@/lib/http/client';

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

  const { data } = await http.get<{ queue?: QueueEntry[] }>(
    `/api/queue/active${params.toString() ? `?${params}` : ''}`
  );
  return (data.queue || []) as QueueEntry[];
}
