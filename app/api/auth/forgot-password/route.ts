import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Content-Type': 'application/json',
};

const normalizeEmail = (value?: string | null) => (value || '').trim().toLowerCase();
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const getAppBaseUrl = () => {
  const envUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');
  return 'http://localhost:3000';
};

const sendWithResend = async (to: string, resetLink: string) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false as const, reason: 'missing_resend_key' };

  const configuredFrom = (process.env.RESEND_FROM_EMAIL || '').trim();
  const from = configuredFrom || 'TranspoGuide <onboarding@resend.dev>';
  const appName = process.env.APP_NAME || 'TranspoGuide';

  const html = `
    <div style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:20px 10px;background:#f1f5f9;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
              <tr>
                <td style="padding:18px 24px;background:#0b2a52;">
                  <h1 style="margin:0;font-size:20px;color:#ffffff;">${appName}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:24px;">
                  <h2 style="margin:0 0 12px;font-size:22px;">Reset your password</h2>
                  <p style="margin:0 0 16px;line-height:1.6;color:#334155;">
                    We received a request to reset your account password.
                  </p>
                  <p style="margin:0 0 24px;">
                    <a href="${resetLink}" style="background:#0ea5e9;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;font-weight:700;">
                      Reset Password
                    </a>
                  </p>
                  <p style="margin:0 0 10px;font-size:13px;color:#475569;line-height:1.6;">
                    If the button does not work, copy this link:
                  </p>
                  <p style="margin:0;font-size:12px;word-break:break-all;color:#2563eb;">
                    ${resetLink}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${appName}: Reset Your Password`,
      html,
    }),
  });

  if (!response.ok) {
    let reason = `resend_http_${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) reason = String(data.message);
    } catch {
      // no-op
    }
    return { ok: false as const, reason };
  }

  const data = await response.json().catch(() => ({}));
  return { ok: true as const, id: typeof data?.id === 'string' ? data.id : null };
};

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'server_env_missing' }, { status: 500, headers: corsHeaders });
    }

    const payload = (await request.json().catch(() => ({}))) as { email?: string };
    const email = normalizeEmail(payload?.email);
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400, headers: corsHeaders });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const appBaseUrl = getAppBaseUrl();
    const redirectTo = `${appBaseUrl}/reset-password`;

    const getActionLink = async (type: 'recovery' | 'magiclink') => {
      const { data, error } = await serviceClient.auth.admin.generateLink({
        type,
        email,
        options: { redirectTo },
      });
      if (error) return { link: null as string | null, error: error.message, type };
      const link =
        (data as any)?.properties?.action_link ||
        (data as any)?.action_link ||
        null;
      return { link: typeof link === 'string' ? link : null, error: null as string | null, type };
    };

    // 1) Standard recovery flow
    const recovery = await getActionLink('recovery');
    // 2) Fallback for OAuth-only accounts: magiclink can still create session
    const magic =
      !recovery.link
        ? await getActionLink('magiclink')
        : { link: null as string | null, error: null as string | null, type: 'magiclink' as const };

    const actionLink = recovery.link || magic.link;

    if (!actionLink || typeof actionLink !== 'string') {
      return NextResponse.json(
        {
          error: 'link_generation_failed',
          reason: recovery.error || magic.error || 'unable_to_generate_link',
        },
        { status: 500, headers: corsHeaders }
      );
    }

    const mailResult = await sendWithResend(email, actionLink);
    if (!mailResult.ok) {
      return NextResponse.json(
        { error: 'email_send_failed', reason: mailResult.reason },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        queued: true,
        providerId: mailResult.id || null,
        linkType: recovery.link ? 'recovery' : 'magiclink',
      },
      { status: 200, headers: corsHeaders }
    );
  } catch {
    return NextResponse.json({ error: 'unexpected_error' }, { status: 500, headers: corsHeaders });
  }
}
