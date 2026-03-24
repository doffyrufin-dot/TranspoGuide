import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type QueueAction = 'join' | 'leave' | 'boarding';

const ACTIVE_STATUSES = ['queued', 'boarding'];

const normalizeEmail = (value?: string | null) =>
  (value || '').trim().toLowerCase();

const toIsoFromTime = (value?: string | null) => {
  const raw = (value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [_, hh, mm] = match;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const date = new Date(`${year}-${month}-${day}T${hh}:${mm}:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

async function reorderRoutePositions(serviceClient: any, route: string) {
  const { data: rows, error } = await serviceClient
    .from('tbl_van_queue')
    .select('id, queue_position')
    .eq('route', route)
    .in('status', ACTIVE_STATUSES)
    .order('queue_position', { ascending: true })
    .order('id', { ascending: true });

  if (error || !rows?.length) return;

  await Promise.all(
    rows.map((row: any, index: number) =>
      (serviceClient as any)
        .from('tbl_van_queue')
        .update({ queue_position: index + 1 })
        .eq('id', row.id)
    )
  );
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json({ error: 'server_env_missing' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return NextResponse.json({ error: 'missing_token' }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
    }

    const payload = (await request.json()) as {
      action?: QueueAction;
      route?: string;
      driverName?: string;
      departureTime?: string;
      plateNumber?: string;
    };

    const action = (payload.action || '').trim().toLowerCase() as QueueAction;
    if (!['join', 'leave', 'boarding'].includes(action)) {
      return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
    }

    const { data: roleRows } = await serviceClient
      .from('tbl_users')
      .select('role, full_name, email')
      .eq('user_id', user.id)
      .limit(1);
    const role = roleRows?.[0]?.role?.trim()?.toLowerCase();

    let hasApprovedApplication = false;
    if (role !== 'operator') {
      const { data: appRows } = await serviceClient
        .from('tbl_operator_applications')
        .select('status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);
      const latestStatus = appRows?.[0]?.status?.trim()?.toLowerCase();
      hasApprovedApplication = latestStatus === 'approved';
    }

    if (role !== 'operator' && !hasApprovedApplication) {
      return NextResponse.json({ error: 'operator_only' }, { status: 403 });
    }

    const operatorName =
      roleRows?.[0]?.full_name ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      'Operator';
    const operatorEmail = normalizeEmail(roleRows?.[0]?.email || user.email);

    const { data: activeRows } = await serviceClient
      .from('tbl_van_queue')
      .select(
        'id, route, status, queue_position, departure_time, plate_number, driver_name'
      )
      .eq('operator_user_id', user.id)
      .in('status', ACTIVE_STATUSES)
      .order('queue_position', { ascending: true })
      .limit(1);
    const activeEntry = activeRows?.[0];

    if (action === 'leave') {
      if (!activeEntry?.id) {
        return NextResponse.json({ ok: true, left: false, queue: null });
      }
      const { error: leaveError } = await serviceClient
        .from('tbl_van_queue')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeEntry.id);
      if (leaveError) {
        return NextResponse.json(
          { error: leaveError.message || 'leave_failed' },
          { status: 500 }
        );
      }
      if (activeEntry.route) {
        await reorderRoutePositions(serviceClient, activeEntry.route);
      }
      return NextResponse.json({ ok: true, left: true, queue: null });
    }

    if (action === 'boarding') {
      if (!activeEntry?.id) {
        return NextResponse.json({ error: 'not_in_queue' }, { status: 400 });
      }

      if (!activeEntry.route) {
        return NextResponse.json(
          { error: 'route_required_for_boarding' },
          { status: 400 }
        );
      }

      const { data: firstRows, error: firstError } = await serviceClient
        .from('tbl_van_queue')
        .select('id, queue_position')
        .eq('route', activeEntry.route)
        .in('status', ACTIVE_STATUSES)
        .order('queue_position', { ascending: true })
        .limit(1);

      if (firstError) {
        return NextResponse.json(
          { error: firstError.message || 'queue_lookup_failed' },
          { status: 500 }
        );
      }

      const firstInLineId = firstRows?.[0]?.id || null;
      if (firstInLineId !== activeEntry.id) {
        return NextResponse.json(
          { error: 'not_your_turn', message: 'Only position #1 can start boarding.' },
          { status: 409 }
        );
      }

      const { error: updateError } = await serviceClient
        .from('tbl_van_queue')
        .update({ status: 'boarding' })
        .eq('id', activeEntry.id);
      if (updateError) {
        return NextResponse.json(
          { error: updateError.message || 'boarding_update_failed' },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, boarding: true });
    }

    // join
    if (activeEntry?.id) {
      return NextResponse.json({
        ok: true,
        alreadyQueued: true,
        queue: {
          id: activeEntry.id,
          route: activeEntry.route || '',
          status: activeEntry.status || 'queued',
          position: Number(activeEntry.queue_position || 0),
          plate: activeEntry.plate_number || 'N/A',
          driver: activeEntry.driver_name || operatorName,
          departure: activeEntry.departure_time || null,
          operatorName,
          operatorEmail,
        },
      });
    }

    const route = (payload.route || '').trim();
    if (!route) {
      return NextResponse.json({ error: 'route_required' }, { status: 400 });
    }

    const driverName = (payload.driverName || '').trim() || operatorName;

    const { data: lastRows } = await serviceClient
      .from('tbl_van_queue')
      .select('queue_position')
      .eq('route', route)
      .in('status', ACTIVE_STATUSES)
      .order('queue_position', { ascending: false })
      .limit(1);
    const nextPosition = Number(lastRows?.[0]?.queue_position || 0) + 1;

    let plateNumber = (payload.plateNumber || '').trim();
    if (!plateNumber) {
      const { data: appRows } = await serviceClient
        .from('tbl_operator_applications')
        .select('plate_number')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);
      plateNumber = (appRows?.[0]?.plate_number || '').trim();
    }
    if (!plateNumber) plateNumber = 'N/A';

    const departureIso =
      toIsoFromTime(payload.departureTime) || new Date().toISOString();

    const { data: insertedRows, error: insertError } = await serviceClient
      .from('tbl_van_queue')
      .insert({
        operator_user_id: user.id,
        plate_number: plateNumber,
        driver_name: driverName,
        route,
        departure_time: departureIso,
        queue_position: nextPosition,
        status: 'queued',
      })
      .select(
        'id, route, status, queue_position, departure_time, plate_number, driver_name'
      )
      .limit(1);

    if (insertError || !insertedRows?.[0]) {
      return NextResponse.json(
        { error: insertError?.message || 'join_failed' },
        { status: 500 }
      );
    }

    await reorderRoutePositions(serviceClient, route);

    const row = insertedRows[0];
    return NextResponse.json({
      ok: true,
      joined: true,
      queue: {
        id: row.id,
        route: row.route || route,
        status: row.status || 'queued',
        position: Number(row.queue_position || nextPosition),
        plate: row.plate_number || plateNumber,
        driver: row.driver_name || driverName,
        departure: row.departure_time || departureIso,
        operatorName,
        operatorEmail,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'unexpected_error' },
      { status: 500 }
    );
  }
}
