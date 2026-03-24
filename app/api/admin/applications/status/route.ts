import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type ApplicationStatus = 'approved' | 'rejected';

const corsHeaders = {
  'Content-Type': 'application/json',
};

const normalizeEmail = (value?: string | null) =>
  (value || '').trim().toLowerCase();

async function sendStatusEmail(params: {
  to: string;
  fullName: string;
  status: ApplicationStatus;
  adminNotes?: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, reason: 'missing_resend_key' as const };
  }

  const useOnboardingFrom = process.env.RESEND_USE_ONBOARDING_FROM === 'true';
  const configuredFrom = (process.env.RESEND_FROM_EMAIL || '').trim();
  const primaryFrom =
    !useOnboardingFrom && configuredFrom
      ? configuredFrom
      : 'TranspoGuide <onboarding@resend.dev>';
  const fallbackFrom = 'TranspoGuide <onboarding@resend.dev>';
  const appName = process.env.APP_NAME || 'TranspoGuide';
  const { to, fullName, status, adminNotes } = params;
  const recipient = normalizeEmail(to);
  if (!recipient || !recipient.includes('@')) {
    return { sent: false, reason: 'invalid_recipient_email' as const };
  }
  const safeName = fullName || 'Operator';
  const approved = status === 'approved';
  const subject = approved
    ? `${appName}: Application Approved`
    : `${appName}: Application Rejected`;
  const headline = approved
    ? 'Your operator application is approved'
    : 'Your operator application was not approved';
  const body = approved
    ? 'Good news. You can now sign in and access your operator dashboard.'
    : 'Your application is currently rejected. Please review your details and update your registration.';
  const appBaseUrl =
    (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').trim() ||
    'http://localhost:3000';
  const loginUrl = `${appBaseUrl.replace(/\/+$/, '')}/login?force=1`;

  const notesSection = adminNotes?.trim()
    ? `<tr>
        <td style="padding:16px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
          <p style="margin:0;font-size:13px;color:#334155;">
            <strong>Admin notes:</strong> ${adminNotes.trim()}
          </p>
        </td>
      </tr>`
    : '';

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
                  <p style="margin:0 0 8px;font-size:15px;color:#0f172a;">Hi ${safeName},</p>
                  <p style="margin:0 0 16px;line-height:1.6;font-size:15px;color:#334155;">${body}</p>

                  ${
                    approved
                      ? `<p style="margin:0 0 20px;">
                           <a href="${loginUrl}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:700;font-size:14px;">
                             Go To Login
                           </a>
                         </p>`
                      : ''
                  }

                  ${notesSection}

                  <p style="margin:16px 0 0;font-size:13px;color:#475569;">
                    You can check your latest account status on the login page.
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
      const data = await response.json().catch(() => ({}));
      return {
        ok: true as const,
        id: typeof data?.id === 'string' ? data.id : null,
      };
    }

    let message = `resend_http_${response.status}`;
    try {
      const errData = await response.json();
      if (errData?.message) message = String(errData.message);
    } catch {
      // no-op
    }
    return { ok: false as const, reason: message };
  };

  const primaryAttempt = await sendWithFrom(primaryFrom);
  if (primaryAttempt.ok) {
    return {
      sent: true as const,
      providerId: primaryAttempt.id,
      mode: primaryFrom.includes('@resend.dev') ? 'testing' : 'production',
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
      sent: false,
      reason: `${primaryAttempt.reason}; fallback_failed:${fallbackAttempt.reason}`,
    };
  }

  return { sent: false, reason: primaryAttempt.reason };
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'server_env_missing' },
        { status: 500, headers: corsHeaders }
      );
    }

    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : '';

    if (!token) {
      return NextResponse.json(
        { error: 'missing_token' },
        { status: 401, headers: corsHeaders }
      );
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
      return NextResponse.json(
        { error: 'invalid_token' },
        { status: 401, headers: corsHeaders }
      );
    }

    let requesterRole: string | null = null;
    const { data: roleById } = await serviceClient
      .from('tbl_users')
      .select('role')
      .eq('user_id', user.id)
      .limit(1);
    requesterRole = roleById?.[0]?.role?.trim()?.toLowerCase() ?? null;

    if (!requesterRole && user.email) {
      const { data: roleByEmail } = await serviceClient
        .from('tbl_users')
        .select('role')
        .ilike('email', normalizeEmail(user.email))
        .limit(1);
      requesterRole = roleByEmail?.[0]?.role?.trim()?.toLowerCase() ?? null;
    }

    if (requesterRole !== 'admin') {
      return NextResponse.json(
        { error: 'forbidden' },
        { status: 403, headers: corsHeaders }
      );
    }

    const payload = (await request.json()) as {
      applicationId?: string;
      status?: string;
      adminNotes?: string;
    };

    const applicationId = (payload.applicationId || '').trim();
    const status = (payload.status || '').trim().toLowerCase();
    const adminNotes = payload.adminNotes || null;

    if (!applicationId || (status !== 'approved' && status !== 'rejected')) {
      return NextResponse.json(
        { error: 'invalid_payload' },
        { status: 400, headers: corsHeaders }
      );
    }

    const { data: updatedRows, error: updateError } = await serviceClient
      .from('tbl_operator_applications')
      .update({ status, admin_notes: adminNotes })
      .eq('id', applicationId)
      .select('id, user_id, full_name, email, status, admin_notes')
      .limit(1);

    if (updateError || !updatedRows?.[0]) {
      return NextResponse.json(
        { error: 'update_failed' },
        { status: 500, headers: corsHeaders }
      );
    }

    const updated = updatedRows[0];
    if (status === 'approved') {
      const normalizedEmail = normalizeEmail(updated.email);
      if (updated.user_id) {
        const { data: existingByUserId } = await serviceClient
          .from('tbl_users')
          .select('id, role')
          .eq('user_id', updated.user_id)
          .limit(1);

        if (existingByUserId?.[0]) {
          const currentRole = existingByUserId[0].role?.trim()?.toLowerCase();
          if (currentRole !== 'admin') {
            await serviceClient
              .from('tbl_users')
              .update({ role: 'operator', email: normalizedEmail })
              .eq('user_id', updated.user_id);
          }
        } else {
          await serviceClient.from('tbl_users').insert({
            user_id: updated.user_id,
            email: normalizedEmail,
            full_name: updated.full_name || null,
            role: 'operator',
          });
        }
      }
    }

    const mailResult = await sendStatusEmail({
      to: updated.email,
      fullName: updated.full_name || 'Operator',
      status: status as ApplicationStatus,
      adminNotes: updated.admin_notes,
    });

  return NextResponse.json(
      {
        ok: true,
        status: updated.status,
        emailTo: normalizeEmail(updated.email),
        emailSent: mailResult.sent,
        emailFallback: mailResult.sent ? !!mailResult.viaFallback : false,
        emailProviderId: mailResult.sent ? mailResult.providerId || null : null,
        emailMode: mailResult.sent ? mailResult.mode || 'production' : null,
        emailError: mailResult.sent ? null : mailResult.reason,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch {
    return NextResponse.json(
      { error: 'unexpected_error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
