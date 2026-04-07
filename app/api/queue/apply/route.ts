import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { markReservationsDepartedForQueue } from '@/lib/db/reservations';

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

const toTimeLabel = (value?: string | null) => {
  if (!value) return 'TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

async function sendDepartedNotificationEmail(params: {
  to: string;
  fullName: string;
  reservationId: string;
  route?: string | null;
  seatLabels?: string[] | null;
  seatCount?: number | null;
  operatorName?: string | null;
  plateNumber?: string | null;
  departureTime?: string | null;
}) {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return { sent: false as const, reason: 'missing_resend_key' };
  }

  const useOnboardingFrom = process.env.RESEND_USE_ONBOARDING_FROM === 'true';
  const configuredFrom = (process.env.RESEND_FROM_EMAIL || '').trim();
  const primaryFrom =
    !useOnboardingFrom && configuredFrom
      ? configuredFrom
      : 'TranspoGuide <onboarding@resend.dev>';
  const fallbackFrom = 'TranspoGuide <onboarding@resend.dev>';
  const appName = (process.env.APP_NAME || 'TranspoGuide').trim();

  const recipient = normalizeEmail(params.to);
  if (!recipient || !recipient.includes('@')) {
    return { sent: false as const, reason: 'invalid_recipient_email' };
  }

  const safeName = params.fullName?.trim() || 'Passenger';
  const routeText = (params.route || '').trim() || 'N/A';
  const operatorText = (params.operatorName || '').trim() || 'Operator';
  const plateText = (params.plateNumber || '').trim() || 'N/A';
  const departureText = toTimeLabel(params.departureTime);
  const seatText =
    Array.isArray(params.seatLabels) && params.seatLabels.length > 0
      ? params.seatLabels.join(', ')
      : 'N/A';
  const seatCountText =
    typeof params.seatCount === 'number' && Number.isFinite(params.seatCount)
      ? String(params.seatCount)
      : Array.isArray(params.seatLabels) && params.seatLabels.length > 0
        ? String(params.seatLabels.length)
        : 'N/A';

  const subject = `${appName}: Van Departed`;
  const html = `
    <div style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:20px 10px;background:#f1f5f9;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
              <tr>
                <td style="padding:18px 24px;background:#0b2a52;">
                  <h1 style="margin:0;font-size:20px;color:#ffffff;">${appName}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:24px;">
                  <h2 style="margin:0 0 12px;font-size:24px;color:#0f172a;">Your van has departed</h2>
                  <p style="margin:0 0 10px;font-size:15px;color:#0f172a;">Hi ${safeName},</p>
                  <p style="margin:0 0 16px;line-height:1.6;font-size:15px;color:#334155;">
                    The van assigned to your booking has now departed from the terminal.
                  </p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 10px;">
                    <tr><td style="padding:6px 0;font-size:14px;color:#334155;"><strong>Reservation ID:</strong> ${params.reservationId}</td></tr>
                    <tr><td style="padding:6px 0;font-size:14px;color:#334155;"><strong>Route:</strong> ${routeText}</td></tr>
                    <tr><td style="padding:6px 0;font-size:14px;color:#334155;"><strong>Operator:</strong> ${operatorText}</td></tr>
                    <tr><td style="padding:6px 0;font-size:14px;color:#334155;"><strong>Plate Number:</strong> ${plateText}</td></tr>
                    <tr><td style="padding:6px 0;font-size:14px;color:#334155;"><strong>Departure Time:</strong> ${departureText}</td></tr>
                    <tr><td style="padding:6px 0;font-size:14px;color:#334155;"><strong>Seat Number(s):</strong> ${seatText}</td></tr>
                    <tr><td style="padding:6px 0;font-size:14px;color:#334155;"><strong>Seat Count:</strong> ${seatCountText}</td></tr>
                    <tr><td style="padding:6px 0;font-size:14px;color:#334155;"><strong>Status:</strong> DEPARTED</td></tr>
                  </table>
                  <p style="margin:16px 0 0;font-size:13px;color:#475569;">
                    Keep this email for your trip reference.
                  </p>
                  <p style="margin:14px 0 0;font-size:14px;color:#0f172a;">- ${appName} Team</p>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:12px;">
                  This is an automated email from ${appName}.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const sendWithFrom = async (from: string) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        html,
      }),
    });

    if (response.ok) {
      return { ok: true as const };
    }

    let reason = `resend_http_${response.status}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) reason = String(body.message);
    } catch {
      // no-op
    }
    return { ok: false as const, reason };
  };

  const primaryAttempt = await sendWithFrom(primaryFrom);
  if (primaryAttempt.ok) return { sent: true as const };

  if (primaryFrom !== fallbackFrom) {
    const fallbackAttempt = await sendWithFrom(fallbackFrom);
    if (fallbackAttempt.ok) return { sent: true as const, viaFallback: true as const };
    return {
      sent: false as const,
      reason: `${primaryAttempt.reason}; fallback_failed:${fallbackAttempt.reason}`,
    };
  }

  return { sent: false as const, reason: primaryAttempt.reason };
}

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
      const isDeparting = String(activeEntry.status || '').toLowerCase() === 'boarding';
      const nextStatus = isDeparting ? 'departed' : 'cancelled';
      const { error: leaveError } = await serviceClient
        .from('tbl_van_queue')
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeEntry.id);
      if (leaveError) {
        return NextResponse.json(
          { error: leaveError.message || 'leave_failed' },
          { status: 500 }
        );
      }

      if (isDeparting) {
        const departedResult = await markReservationsDepartedForQueue({
          queueId: activeEntry.id,
          operatorUserId: user.id,
          senderName: operatorName,
        });

        const reservationsForEmail = departedResult.reservations.filter((row) => {
          const email = normalizeEmail(row.passenger_email);
          return !!email && email.includes('@');
        });

        await Promise.allSettled(
          reservationsForEmail.map((row) =>
            sendDepartedNotificationEmail({
              to: normalizeEmail(row.passenger_email),
              fullName: row.full_name || 'Passenger',
              reservationId: row.id,
              route: row.route || activeEntry.route || '',
              seatLabels: Array.isArray(row.seat_labels) ? row.seat_labels : [],
              seatCount:
                typeof row.seat_count === 'number' && Number.isFinite(row.seat_count)
                  ? row.seat_count
                  : null,
              operatorName,
              plateNumber: activeEntry.plate_number || '',
              departureTime: activeEntry.departure_time || null,
            })
          )
        );
      }

      if (activeEntry.route) {
        await reorderRoutePositions(serviceClient, activeEntry.route);
      }
      return NextResponse.json({
        ok: true,
        left: true,
        departed: isDeparting,
        queue: null,
      });
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
