import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY || '';

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');
const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());

const resolveBaseUrl = (req: NextRequest) => {
  const fromEnv = (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ''
  ).trim();
  if (fromEnv) {
    return normalizeBaseUrl(fromEnv);
  }

  const vercelUrl = (process.env.VERCEL_URL || '').trim();
  if (vercelUrl) {
    const host = vercelUrl.replace(/^https?:\/\//i, '');
    return `https://${host}`;
  }

  const forwardedHost = (req.headers.get('x-forwarded-host') || '').trim();
  const host = forwardedHost || (req.headers.get('host') || '').trim();
  const forwardedProto = (req.headers.get('x-forwarded-proto') || '').trim();

  if (host) {
    const protocol =
      forwardedProto || (host.includes('localhost') ? 'http' : 'https');
    return `${protocol}://${host}`;
  }

  return 'http://localhost:3000';
};

const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service env is missing.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const resolveOperatorSecretKey = async (params: {
  reservationId: string;
  operatorUserIdFromBody?: string;
}) => {
  const supabase = getServiceClient();
  const { reservationId, operatorUserIdFromBody } = params;

  const { data: reservationRows, error: reservationError } = await supabase
    .from('tbl_reservations')
    .select('operator_user_id')
    .eq('id', reservationId)
    .limit(1);

  if (reservationError) {
    throw new Error(reservationError.message || 'Failed to resolve reservation operator.');
  }

  const operatorUserId =
    (reservationRows?.[0] as any)?.operator_user_id ||
    (operatorUserIdFromBody || '').trim() ||
    null;

  if (!operatorUserId) {
    if (PAYMONGO_SECRET_KEY) {
      return {
        secretKey: PAYMONGO_SECRET_KEY,
        operatorUserId: '',
      };
    }
    throw new Error('No operator is linked to this reservation.');
  }

  const { data: accountRows, error: accountError } = await supabase
    .from('tbl_operator_payment_accounts')
    .select('paymongo_secret_key')
    .eq('operator_user_id', operatorUserId)
    .eq('is_active', true)
    .limit(1);

  if (accountError) {
    throw new Error(accountError.message || 'Failed to load operator payment account.');
  }

  const key = ((accountRows?.[0] as any)?.paymongo_secret_key || '').trim();
  if (key) {
    return {
      secretKey: key,
      operatorUserId,
    };
  }

  if (PAYMONGO_SECRET_KEY) {
    return {
      secretKey: PAYMONGO_SECRET_KEY,
      operatorUserId,
    };
  }
  throw new Error('Operator payment account key is not configured.');
};

const resolveReservationToken = async (reservationId: string) => {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('tbl_reservations')
    .select('guest_token')
    .eq('id', reservationId)
    .limit(1);

  if (error) {
    throw new Error(error.message || 'Failed to load reservation token.');
  }

  const token = ((data?.[0] as any)?.guest_token || '').trim();
  if (!token) {
    throw new Error('Reservation token is missing.');
  }

  return token;
};

export async function POST(req: NextRequest) {
  try {
    const baseUrl = resolveBaseUrl(req);
    const body = await req.json();
    const {
      amount,
      seatLabels,
      fullName,
      passengerEmail,
      contactNumber,
      route,
      reservationId,
      operatorUserId,
      queueId,
    } = body;

    if (!reservationId || typeof reservationId !== 'string') {
      return NextResponse.json({ error: 'Missing reservation ID.' }, { status: 400 });
    }
    if (!isValidEmail(passengerEmail || '')) {
      return NextResponse.json(
        { error: 'Invalid passenger email.' },
        { status: 400 }
      );
    }

    const amountInCentavos = Math.round(Number(amount || 0) * 100);
    const { secretKey: resolvedSecretKey, operatorUserId: resolvedOperatorUserId } =
      await resolveOperatorSecretKey({
      reservationId,
      operatorUserIdFromBody: operatorUserId,
    });
    const reservationToken = await resolveReservationToken(reservationId);

    const description = `Down payment for seat(s) ${seatLabels} - ${route}`;

    const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(resolvedSecretKey + ':').toString('base64')}`,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              {
                name: `Van Reservation - Seat(s) ${seatLabels}`,
                description,
                amount: amountInCentavos,
                currency: 'PHP',
                quantity: 1,
              },
            ],
            payment_method_types: ['gcash', 'paymaya'],
            description,
            send_email_receipt: true,
            show_description: true,
            show_line_items: true,
            success_url: `${baseUrl}/reservation/status?reservation_id=${encodeURIComponent(
              reservationId
            )}&reservation_token=${encodeURIComponent(reservationToken)}&payment=success`,
            cancel_url: `${baseUrl}/reservation/status?reservation_id=${encodeURIComponent(
              reservationId
            )}&reservation_token=${encodeURIComponent(reservationToken)}&payment=cancelled`,
            metadata: {
              reservation_id: reservationId,
              full_name: fullName,
              passenger_email: passengerEmail || '',
              contact_number: contactNumber,
              seats: seatLabels,
              route,
              operator_user_id: resolvedOperatorUserId || '',
              queue_id: queueId || '',
            },
          },
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('PayMongo error:', JSON.stringify(data, null, 2));
      return NextResponse.json(
        { error: data.errors?.[0]?.detail || 'Failed to create checkout session' },
        { status: response.status }
      );
    }

    const checkoutUrl = data.data.attributes.checkout_url;
    const checkoutSessionId = (data?.data?.id || '').toString().trim();

    if (checkoutSessionId) {
      const supabase = getServiceClient();
      await supabase
        .from('tbl_reservations')
        .update({
          payment_id: checkoutSessionId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reservationId);
    }

    return NextResponse.json({
      checkout_url: checkoutUrl,
      checkout_session_id: checkoutSessionId || null,
    });
  } catch (error: any) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
