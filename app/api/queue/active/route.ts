import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const toTimeLabel = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const normalizeRouteKey = (value?: string | null) =>
  (value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const toRouteLabel = (value?: string | null) => {
  const normalized = normalizeRouteKey(value);
  if (!normalized) return '';
  return normalized
    .split(' ')
    .map((part) =>
      part ? part.charAt(0).toUpperCase() + part.slice(1) : part
    )
    .join(' ');
};

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'server_env_missing' }, { status: 500 });
    }

    const routeFilter = normalizeRouteKey(
      req.nextUrl.searchParams.get('route')?.trim() || null
    );

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let query = supabase
      .from('tbl_van_queue')
      .select(
        'id, operator_user_id, plate_number, driver_name, route, departure_time, queue_position, status'
      )
      .in('status', ['queued', 'boarding'])
      .order('queue_position', { ascending: true })
      .limit(30);

    if (routeFilter) {
      query = query.ilike('route', routeFilter);
    }

    const { data: queueRows, error: queueError } = await query;
    if (queueError) {
      return NextResponse.json(
        { error: queueError.message || 'Failed to load queue.' },
        { status: 500 }
      );
    }

    const normalizedRows = [...(queueRows || [])];
    const groupedByRoute = new Map<string, any[]>();
    for (const row of normalizedRows) {
      const routeKey = normalizeRouteKey(row.route);
      if (!routeKey) continue;
      const group = groupedByRoute.get(routeKey) || [];
      group.push(row);
      groupedByRoute.set(routeKey, group);
    }

    const nowIso = new Date().toISOString();
    const normalizeUpdates: any[] = [];
    for (const rows of groupedByRoute.values()) {
      const sorted = [...rows].sort((a, b) => {
        const posDiff = Number(a.queue_position || 0) - Number(b.queue_position || 0);
        if (posDiff !== 0) return posDiff;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });

      sorted.forEach((row, index) => {
        const expectedPosition = index + 1;
        const expectedStatus = index === 0 ? 'boarding' : 'queued';
        const currentStatus = String(row.status || '').toLowerCase();
        const currentPosition = Number(row.queue_position || 0);
        const needsUpdate =
          currentPosition !== expectedPosition || currentStatus !== expectedStatus;

        if (!needsUpdate) return;

        row.queue_position = expectedPosition;
        row.status = expectedStatus;
        normalizeUpdates.push(
          supabase
            .from('tbl_van_queue')
            .update({
              queue_position: expectedPosition,
              status: expectedStatus,
              updated_at: nowIso,
            })
            .eq('id', row.id)
        );
      });
    }

    if (normalizeUpdates.length > 0) {
      await Promise.allSettled(normalizeUpdates);
    }

    const operatorIds = Array.from(
      new Set(normalizedRows.map((q: any) => q.operator_user_id).filter(Boolean))
    ) as string[];

    let userMap = new Map<string, { full_name: string | null; email: string | null }>();
    if (operatorIds.length > 0) {
      const { data: userRows } = await supabase
        .from('tbl_users')
        .select('user_id, full_name, email')
        .in('user_id', operatorIds);

      userMap = new Map(
        (userRows || []).map((u: any) => [
          u.user_id,
          { full_name: u.full_name || null, email: u.email || null },
        ])
      );
    }

    const queue = normalizedRows.map((q: any) => {
      const operator = userMap.get(q.operator_user_id) || {
        full_name: null,
        email: null,
      };

      return {
        id: q.id,
        operatorUserId: q.operator_user_id || '',
        plate: q.plate_number || 'N/A',
        driver: q.driver_name || 'No driver',
        operatorName: operator.full_name || 'Unknown operator',
        operatorEmail: operator.email || '',
        departure: toTimeLabel(q.departure_time) || 'TBD',
        status: q.status || 'queued',
        position: Number(q.queue_position || 0),
        route: toRouteLabel(q.route || ''),
      };
    });

    return NextResponse.json({ queue });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unexpected error.' },
      { status: 500 }
    );
  }
}
