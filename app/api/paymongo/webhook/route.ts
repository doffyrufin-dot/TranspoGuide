import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { markReservationPaid, releaseReservationLocks } from '@/lib/db/reservations';

const extractReservationId = (payload: any): string | null => {
  const candidates = [
    payload?.data?.attributes?.data?.attributes?.metadata?.reservation_id,
    payload?.data?.attributes?.data?.attributes?.payments?.[0]?.attributes?.metadata
      ?.reservation_id,
    payload?.data?.attributes?.metadata?.reservation_id,
    payload?.data?.attributes?.data?.attributes?.checkout_session?.metadata
      ?.reservation_id,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const extractPaymentId = (payload: any): string | null => {
  const isPaymentId = (value: unknown) =>
    typeof value === 'string' && value.trim().startsWith('pay_');

  const candidates = [
    payload?.data?.attributes?.data?.attributes?.payments?.[0]?.id,
    payload?.data?.attributes?.data?.id,
    payload?.data?.attributes?.id,
  ];

  for (const value of candidates) {
    if (isPaymentId(value)) return (value as string).trim();
  }

  const walk = (node: any): string | null => {
    if (!node) return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item);
        if (found) return found;
      }
      return null;
    }
    if (typeof node === 'object') {
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (isPaymentId(value)) return (value as string).trim();
        const found = walk(value);
        if (found) return found;
      }
    }
    return null;
  };

  const deepPaymentId = walk(payload);
  if (deepPaymentId) {
    return deepPaymentId;
  }

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const GLOBAL_WEBHOOK_SECRETS = Array.from(
  new Set(
    [
      process.env.PAYMONGO_WEBHOOK_SECRET,
      process.env.PAYMONGO_WEBHOOK_SECRET_TEST,
      process.env.PAYMONGO_WEBHOOK_SECRET_LIVE,
    ]
      .map((value) => (value || '').trim())
      .filter(Boolean)
  )
);
const WEBHOOK_TOLERANCE_SECONDS = Number(
  process.env.PAYMONGO_WEBHOOK_TOLERANCE_SECONDS || '300'
);

const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('server_env_missing');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const normalizeSecret = (value: unknown) => String(value || '').trim();

const extractOperatorUserId = (payload: any): string | null => {
  const candidates = [
    payload?.data?.attributes?.data?.attributes?.metadata?.operator_user_id,
    payload?.data?.attributes?.metadata?.operator_user_id,
    payload?.data?.attributes?.data?.attributes?.checkout_session?.metadata
      ?.operator_user_id,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return null;
};

const extractWebhookSecretFromAccount = (row: Record<string, unknown>) => {
  const candidates = [
    row.paymongo_webhook_secret,
    row.paymongo_webhook_signing_secret,
    row.webhook_secret,
  ];

  for (const value of candidates) {
    const normalized = normalizeSecret(value);
    if (normalized) return normalized;
  }

  return '';
};

const resolveOperatorWebhookSecrets = async (params: {
  operatorUserId?: string | null;
  reservationId?: string | null;
}) => {
  const supabase = getServiceClient();
  let operatorUserId = normalizeSecret(params.operatorUserId);

  if (!operatorUserId && params.reservationId) {
    const { data: reservationRows, error: reservationError } = await supabase
      .from('tbl_reservations')
      .select('operator_user_id')
      .eq('id', params.reservationId)
      .limit(1);

    if (!reservationError) {
      operatorUserId = normalizeSecret((reservationRows?.[0] as any)?.operator_user_id);
    }
  }

  if (!operatorUserId) return [];

  const { data: accountRows, error: accountError } = await supabase
    .from('tbl_operator_payment_accounts')
    .select('*')
    .eq('operator_user_id', operatorUserId)
    .eq('is_active', true)
    .limit(5);

  if (accountError || !accountRows?.length) {
    return [];
  }

  return accountRows
    .map((row) => extractWebhookSecretFromAccount(row as Record<string, unknown>))
    .filter(Boolean);
};

const safeEqualHex = (left: string, right: string) => {
  try {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    if (a.length !== b.length || a.length === 0) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

const parseSignatureHeader = (headerValue: string) => {
  const map = new Map<string, string[]>();
  const segments = headerValue
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const eqIndex = segment.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = segment.slice(0, eqIndex).trim().toLowerCase();
    const value = segment.slice(eqIndex + 1).trim();
    if (!value) continue;
    const list = map.get(key) || [];
    list.push(value);
    map.set(key, list);
  }

  return map;
};

const verifyWebhookSignature = (
  rawBody: string,
  signatureHeader: string | null,
  secrets: string[]
) => {
  if (secrets.length === 0) {
    return { ok: false, reason: 'webhook_secret_missing' as const };
  }
  if (!signatureHeader) {
    return { ok: false, reason: 'missing_signature_header' as const };
  }

  const signatureMap = parseSignatureHeader(signatureHeader);
  const timestampRaw = (signatureMap.get('t') || [])[0] || '';
  const timestamp = Number(timestampRaw);

  if (!Number.isFinite(timestamp)) {
    return { ok: false, reason: 'invalid_signature_timestamp' as const };
  }

  if (WEBHOOK_TOLERANCE_SECONDS > 0) {
    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Math.floor(timestamp));
    if (ageSeconds > WEBHOOK_TOLERANCE_SECONDS) {
      return { ok: false, reason: 'signature_timestamp_expired' as const };
    }
  }

  const providedSignatures = [
    ...(signatureMap.get('te') || []),
    ...(signatureMap.get('li') || []),
    ...(signatureMap.get('v1') || []),
  ]
    .map((value) => value.toLowerCase())
    .filter(Boolean);

  if (providedSignatures.length === 0) {
    return { ok: false, reason: 'missing_signature_digest' as const };
  }

  const signedPayload = `${Math.floor(timestamp)}.${rawBody}`;
  const matched = secrets.some((secret) => {
    const expected = createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex')
      .toLowerCase();
    return providedSignatures.some((provided) => safeEqualHex(expected, provided));
  });

  if (!matched) {
    return { ok: false, reason: 'invalid_signature' as const };
  }

  return { ok: true as const };
};

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'invalid_json_payload' }, { status: 400 });
    }

    const reservationId = extractReservationId(payload);
    const operatorUserId = extractOperatorUserId(payload);
    const operatorWebhookSecrets = await resolveOperatorWebhookSecrets({
      operatorUserId,
      reservationId,
    });
    const signatureSecrets = Array.from(
      new Set([...operatorWebhookSecrets, ...GLOBAL_WEBHOOK_SECRETS].filter(Boolean))
    );

    const signatureCheck = verifyWebhookSignature(
      rawBody,
      req.headers.get('paymongo-signature'),
      signatureSecrets
    );
    if (!signatureCheck.ok) {
      return NextResponse.json({ error: signatureCheck.reason }, { status: 401 });
    }

    const eventType = payload?.data?.attributes?.type as string | undefined;

    if (!reservationId) {
      return NextResponse.json({ ok: true, skipped: 'missing_reservation_id' });
    }

    const paymentId = extractPaymentId(payload) || undefined;

    if (eventType?.includes('paid')) {
      await markReservationPaid(reservationId, paymentId);
      return NextResponse.json({ ok: true, status: 'paid' });
    }

    if (eventType?.includes('failed') || eventType?.includes('expired')) {
      await releaseReservationLocks(reservationId);
      return NextResponse.json({ ok: true, status: 'released' });
    }

    return NextResponse.json({ ok: true, ignored: eventType || 'unknown' });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Webhook handling failed.' },
      { status: 500 }
    );
  }
}
