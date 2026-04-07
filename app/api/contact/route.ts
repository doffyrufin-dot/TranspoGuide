import { NextRequest, NextResponse } from 'next/server';

const corsHeaders = {
  'Content-Type': 'application/json',
};

type ContactPayload = {
  firstName?: string;
  lastName?: string;
  email?: string;
  subject?: string;
  message?: string;
  website?: string; // honeypot
};

const normalizeEmail = (value?: string | null) =>
  (value || '').trim().toLowerCase();

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const cleanText = (value?: string | null) => (value || '').trim();

const extractEmailFromFromField = (fromField: string) => {
  const trimmed = cleanText(fromField);
  if (!trimmed) return '';
  const match = trimmed.match(/<([^>]+)>/);
  const raw = match?.[1] || trimmed;
  return normalizeEmail(raw);
};

const resolveRecipientEmail = () => {
  const candidates = [
    process.env.CONTACT_RECEIVER_EMAIL,
    process.env.SUPPORT_RECEIVER_EMAIL,
    process.env.ADMIN_EMAIL,
  ]
    .map((value) => normalizeEmail(value))
    .filter(Boolean);

  if (candidates.length > 0) return candidates[0];

  const fromField = cleanText(process.env.RESEND_FROM_EMAIL);
  const extracted = extractEmailFromFromField(fromField);
  if (isValidEmail(extracted)) return extracted;

  return '';
};

const sendContactEmail = async (payload: {
  firstName: string;
  lastName: string;
  email: string;
  subject: string;
  message: string;
}) => {
  const apiKey = cleanText(process.env.RESEND_API_KEY);
  if (!apiKey) return { ok: false as const, reason: 'missing_resend_key' };

  const recipient = resolveRecipientEmail();
  if (!isValidEmail(recipient)) {
    return { ok: false as const, reason: 'missing_contact_receiver_email' };
  }

  const useOnboardingFrom = process.env.RESEND_USE_ONBOARDING_FROM === 'true';
  const configuredFrom = cleanText(process.env.RESEND_FROM_EMAIL);
  const primaryFrom =
    !useOnboardingFrom && configuredFrom
      ? configuredFrom
      : 'TranspoGuide <onboarding@resend.dev>';
  const fallbackFrom = 'TranspoGuide <onboarding@resend.dev>';
  const appName = cleanText(process.env.APP_NAME) || 'TranspoGuide';

  const safeSubject = payload.subject.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeName = `${payload.firstName} ${payload.lastName}`
    .trim()
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const safeEmail = payload.email.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeMessage = payload.message
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />');

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
                  <h2 style="margin:0 0 12px;font-size:22px;">New Contact Message</h2>
                  <p style="margin:0 0 14px;color:#334155;font-size:14px;"><strong>From:</strong> ${safeName}</p>
                  <p style="margin:0 0 14px;color:#334155;font-size:14px;"><strong>Email:</strong> ${safeEmail}</p>
                  <p style="margin:0 0 14px;color:#334155;font-size:14px;"><strong>Subject:</strong> ${safeSubject}</p>
                  <div style="margin-top:14px;padding:14px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;color:#1e293b;font-size:14px;line-height:1.55;">
                    ${safeMessage}
                  </div>
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
        reply_to: payload.email,
        subject: `${appName}: Contact - ${payload.subject}`,
        html,
      }),
    });

    if (response.ok) {
      const data = (await response.json().catch(() => ({}))) as { id?: string };
      return { ok: true as const, id: typeof data.id === 'string' ? data.id : null };
    }

    let reason = `resend_http_${response.status}`;
    try {
      const data = (await response.json()) as { message?: string };
      if (data?.message) reason = String(data.message);
    } catch {
      // no-op
    }
    return { ok: false as const, reason };
  };

  const firstAttempt = await sendWithFrom(primaryFrom);
  if (firstAttempt.ok) {
    return {
      ok: true as const,
      id: firstAttempt.id,
      mode: primaryFrom.includes('@resend.dev') ? 'testing' : 'production',
      viaFallback: false,
    };
  }

  if (primaryFrom !== fallbackFrom) {
    const fallbackAttempt = await sendWithFrom(fallbackFrom);
    if (fallbackAttempt.ok) {
      return {
        ok: true as const,
        id: fallbackAttempt.id,
        mode: 'testing' as const,
        viaFallback: true,
      };
    }
    return {
      ok: false as const,
      reason: `${firstAttempt.reason}; fallback_failed:${fallbackAttempt.reason}`,
    };
  }

  return { ok: false as const, reason: firstAttempt.reason };
};

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => ({}))) as ContactPayload;
    const firstName = cleanText(payload.firstName);
    const lastName = cleanText(payload.lastName);
    const email = normalizeEmail(payload.email);
    const subject = cleanText(payload.subject);
    const message = cleanText(payload.message);
    const website = cleanText(payload.website);

    // Honeypot trap: silently accept to avoid bot retries.
    if (website) {
      return NextResponse.json({ ok: true, accepted: true }, { status: 200, headers: corsHeaders });
    }

    if (!firstName || !lastName || !email || !subject || !message) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400, headers: corsHeaders });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400, headers: corsHeaders });
    }
    if (firstName.length > 80 || lastName.length > 80) {
      return NextResponse.json({ error: 'Name is too long.' }, { status: 400, headers: corsHeaders });
    }
    if (subject.length > 140) {
      return NextResponse.json({ error: 'Subject is too long.' }, { status: 400, headers: corsHeaders });
    }
    if (message.length > 3000) {
      return NextResponse.json({ error: 'Message is too long.' }, { status: 400, headers: corsHeaders });
    }

    const mailResult = await sendContactEmail({
      firstName,
      lastName,
      email,
      subject,
      message,
    });

    if (!mailResult.ok) {
      return NextResponse.json(
        { error: mailResult.reason || 'Failed to send contact email.' },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        queued: true,
        providerId: mailResult.id || null,
        mode: mailResult.mode,
        viaFallback: !!mailResult.viaFallback,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch {
    return NextResponse.json(
      { error: 'Unexpected error while sending message.' },
      { status: 500, headers: corsHeaders }
    );
  }
}

