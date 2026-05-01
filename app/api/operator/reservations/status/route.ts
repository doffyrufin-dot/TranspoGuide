import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateReservationStatusByOperator } from '@/lib/db/reservations';

type ReservationStatus = 'confirmed' | 'rejected' | 'picked_up';
type NotifiableStatus = 'confirmed' | 'rejected';

const normalizeEmail = (value?: string | null) =>
  (value || '').trim().toLowerCase();

async function sendReservationStatusEmail(params: {
  to: string;
  fullName: string;
  status: NotifiableStatus;
  route?: string | null;
  seatLabels?: string[] | null;
  seatCount?: number | null;
  operatorName?: string | null;
  plateNumber?: string | null;
  reservationId: string;
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
  const isConfirmed = params.status === 'confirmed';
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
  const routeText = (params.route || '').trim() || 'N/A';
  const operatorText = (params.operatorName || '').trim() || 'N/A';
  const plateText = (params.plateNumber || '').trim() || 'N/A';

  const subject = isConfirmed
    ? `${appName}: Reservation Approved - Downpayment Required`
    : `${appName}: Reservation Rejected`;
  const headline = isConfirmed
    ? 'Your reservation is approved'
    : 'Your reservation was rejected';
  const body = isConfirmed
    ? 'Your booking has been approved by the operator. Please pay the downpayment to finalize your seat.'
    : 'The operator rejected your booking. You may submit a new reservation.';

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
                  <h2 style="margin:0 0 12px;font-size:24px;color:#0f172a;">${headline}</h2>
                  <p style="margin:0 0 10px;font-size:15px;color:#0f172a;">Hi ${safeName},</p>
                  <p style="margin:0 0 16px;line-height:1.6;font-size:15px;color:#334155;">${body}</p>

                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 10px;">
                    <tr><td style="padding:6px 0;font-size:14px;color:#334155;"><strong>Reservation ID:</strong> ${params.reservationId}</td></tr>
                    <tr><td style="padding:6px 0;font-size:14px;color:#334155;"><strong>Route:</strong> ${routeText}</td></tr>
                    <tr><td style="padding:6px 0;font-size:14px;color:#334155;"><strong>Operator:</strong> ${operatorText}</td></tr>
                    <tr><td style="padding:6px 0;font-size:14px;color:#334155;"><strong>Plate Number:</strong> ${plateText}</td></tr>
                    <tr><td style="padding:6px 0;font-size:14px;color:#334155;"><strong>Selected Seat Number(s):</strong> ${seatText}</td></tr>
                    <tr><td style="padding:6px 0;font-size:14px;color:#334155;"><strong>Seat Count:</strong> ${seatCountText}</td></tr>
                    <tr><td style="padding:6px 0;font-size:14px;color:#334155;"><strong>Status:</strong> ${isConfirmed ? 'PENDING PAYMENT' : 'REJECTED'}</td></tr>
                  </table>

                  <p style="margin:16px 0 0;font-size:13px;color:#475569;">
                    Keep this email for your booking reference.
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
      const data = (await response.json().catch(() => ({}))) as { id?: string };
      return { ok: true as const, id: typeof data.id === 'string' ? data.id : null };
    }

    let message = `resend_http_${response.status}`;
    try {
      const errData = (await response.json()) as { message?: string };
      if (errData?.message) message = String(errData.message);
    } catch {
      // no-op
    }
    return { ok: false as const, reason: message };
  };

  const primaryAttempt = await sendWithFrom(primaryFrom);
  if (primaryAttempt.ok) {
    const mode: 'testing' | 'production' = primaryFrom.includes('@resend.dev')
      ? 'testing'
      : 'production';
    return {
      sent: true as const,
      providerId: primaryAttempt.id,
      mode,
    };
  }

  if (primaryFrom !== fallbackFrom) {
    const fallbackAttempt = await sendWithFrom(fallbackFrom);
    if (fallbackAttempt.ok) {
      return {
        sent: true as const,
        providerId: fallbackAttempt.id,
        viaFallback: true as const,
        mode: 'testing' as const,
      };
    }
    return {
      sent: false as const,
      reason: `${primaryAttempt.reason}; fallback_failed:${fallbackAttempt.reason}`,
    };
  }

  return { sent: false as const, reason: primaryAttempt.reason };
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json({ error: 'server_env_missing' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!token) {
      return NextResponse.json({ error: 'missing_auth_token' }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const reservationId = (body.reservationId || '').trim();
    const status = (body.status || '').trim().toLowerCase();
    if (!reservationId || (status !== 'confirmed' && status !== 'rejected' && status !== 'picked_up')) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }

    if (status === 'confirmed') {
      const { data: accountRows, error: accountError } = await serviceClient
        .from('tbl_operator_payment_accounts')
        .select('id, paymongo_secret_key, is_active')
        .eq('operator_user_id', user.id)
        .eq('is_active', true)
        .limit(1);

      if (accountError) {
        return NextResponse.json(
          { error: accountError.message || 'Failed to validate payout setup.' },
          { status: 500 }
        );
      }

      const hasSecretKey = !!String(
        (accountRows?.[0] as { paymongo_secret_key?: string | null } | undefined)
          ?.paymongo_secret_key || ''
      ).trim();

      if (!hasSecretKey) {
        return NextResponse.json(
          {
            error:
              'Payout setup required before approval. Please add your PayMongo Secret Key in Settings.',
          },
          { status: 409 }
        );
      }
    }

    const updated = await updateReservationStatusByOperator({
      reservationId,
      operatorUserId: user.id,
      status: status as ReservationStatus,
    });

    const updatedOperatorUserId =
      typeof updated.operator_user_id === 'string'
        ? updated.operator_user_id.trim()
        : '';
    const updatedQueueId =
      typeof updated.queue_id === 'string' ? updated.queue_id.trim() : '';
    const updatedRoute =
      typeof updated.route === 'string' ? updated.route.trim() : '';

    let operatorName = 'Operator';
    if (updatedOperatorUserId) {
      const { data: operatorRow } = await serviceClient
        .from('tbl_users')
        .select('full_name')
        .eq('user_id', updatedOperatorUserId)
        .limit(1)
        .maybeSingle();

      if (operatorRow?.full_name) {
        operatorName = String(operatorRow.full_name);
      }
    }

    let plateNumber = '';
    if (updatedQueueId) {
      const { data: queueRow } = await serviceClient
        .from('tbl_van_queue')
        .select('plate_number')
        .eq('id', updatedQueueId)
        .limit(1)
        .maybeSingle();

      if (queueRow?.plate_number) {
        plateNumber = String(queueRow.plate_number);
      }
    }

    if (!plateNumber && updatedOperatorUserId) {
      let fallbackQueueQuery = serviceClient
        .from('tbl_van_queue')
        .select('plate_number')
        .eq('operator_user_id', updatedOperatorUserId)
        .in('status', ['boarding', 'queued']);

      if (updatedRoute) {
        fallbackQueueQuery = fallbackQueueQuery.eq('route', updatedRoute);
      }

      const { data: fallbackQueueRows } = await fallbackQueueQuery
        .order('updated_at', { ascending: false })
        .limit(5);
      const fallbackPlate = fallbackQueueRows?.find((row) => !!row?.plate_number)?.plate_number;
      if (fallbackPlate) {
        plateNumber = String(fallbackPlate);
      }
    }

    let mailResult: {
      sent: boolean;
      providerId?: string | null;
      mode?: 'testing' | 'production';
      viaFallback?: boolean;
      reason?: string;
    } | null = null;

    if ((status === 'confirmed' || status === 'rejected') && updated.passenger_email) {
      mailResult = await sendReservationStatusEmail({
        to: updated.passenger_email,
        fullName: updated.full_name || 'Passenger',
        status: status as NotifiableStatus,
        route: updated.route || null,
        seatLabels: Array.isArray(updated.seat_labels) ? updated.seat_labels : null,
        seatCount:
          typeof updated.seat_count === 'number' && Number.isFinite(updated.seat_count)
            ? updated.seat_count
            : null,
        operatorName,
        plateNumber: plateNumber || null,
        reservationId: updated.id,
      });
    }

    return NextResponse.json({
      ok: true,
      reservation: updated,
      emailSent: mailResult?.sent ?? false,
      emailProviderId: mailResult?.sent ? mailResult.providerId || null : null,
      emailMode: mailResult?.sent ? mailResult.mode || 'production' : null,
      emailFallback: mailResult?.sent ? !!mailResult.viaFallback : false,
      emailError: mailResult && !mailResult.sent ? mailResult.reason || 'email_send_failed' : null,
    });
  } catch (error: unknown) {
    const rawMessage =
      error instanceof Error && error.message
        ? error.message
        : 'Failed to update reservation status.';
    const normalized = String(rawMessage).toLowerCase();
    const isStatusConstraintMismatch =
      normalized.includes('tbl_reservations_status_check') ||
      normalized.includes('violates check constraint');
    const message = isStatusConstraintMismatch
      ? 'Reservation status update blocked by database schema. Run supabase/sql/reservations_status_expand.sql, then try again.'
      : rawMessage;
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
