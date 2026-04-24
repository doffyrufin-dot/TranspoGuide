import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type AnySupabaseClient = SupabaseClient<any, 'public', any>;

const isMissingColumnError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  const code = String(err.code || '').toUpperCase();
  const message = String(err.message || '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    message.includes('column') ||
    message.includes('does not exist')
  );
};

const maskSecret = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.length <= 6) return `${raw.slice(0, 2)}***`;
  return `${raw.slice(0, 4)}***${raw.slice(-3)}`;
};

const normalizeAppStatus = (value?: string | null) => {
  const status = String(value || '')
    .trim()
    .toLowerCase();
  if (status === 'pending' || status === 'approved' || status === 'rejected') {
    return status;
  }
  return null;
};

const buildStatusPayload = (params: {
  applicationStatus: 'pending' | 'approved' | 'rejected' | null;
  activeAccount: {
    id?: string | null;
    paymongo_secret_key?: string | null;
  } | null;
  hasWebhookSecret: boolean;
  webhookSecretSupported: boolean;
}) => {
  const hasSecretKey = !!String(
    params.activeAccount?.paymongo_secret_key || ''
  ).trim();
  const hasActiveAccount = !!params.activeAccount;
  const setupRequired = params.applicationStatus === 'approved' && !hasSecretKey;

  return {
    setupRequired,
    hasActiveAccount,
    hasSecretKey,
    hasWebhookSecret: params.hasWebhookSecret,
    webhookSecretSupported: params.webhookSecretSupported,
    applicationStatus: params.applicationStatus,
    activeAccountId: String(params.activeAccount?.id || '').trim() || null,
    maskedSecretKey: maskSecret(params.activeAccount?.paymongo_secret_key || ''),
  };
};

const getAuthAndServiceClients = (req: NextRequest) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('server_env_missing');
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) {
    throw new Error('missing_auth_token');
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { authClient, serviceClient, token };
};

const getLatestApplicationStatus = async (
  serviceClient: AnySupabaseClient,
  userId: string
) => {
  const { data, error } = await serviceClient
    .from('tbl_operator_applications')
    .select('status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message || 'Failed to load application status.');
  }

  return normalizeAppStatus((data?.[0] as { status?: string | null })?.status);
};

const getActivePaymentAccount = async (
  serviceClient: AnySupabaseClient,
  userId: string
) => {
  const { data, error } = await serviceClient
    .from('tbl_operator_payment_accounts')
    .select('id, paymongo_secret_key, is_active')
    .eq('operator_user_id', userId)
    .order('is_active', { ascending: false })
    .order('id', { ascending: false })
    .limit(5);

  if (error) {
    throw new Error(error.message || 'Failed to load operator payment account.');
  }

  const rows = (data || []) as Array<{
    id?: string | null;
    paymongo_secret_key?: string | null;
    is_active?: boolean | null;
  }>;
  const active = rows.find((row) => row.is_active) || rows[0] || null;
  return active;
};

const readWebhookSecretState = async (
  serviceClient: AnySupabaseClient,
  accountId?: string | null
) => {
  if (!accountId) {
    return { hasWebhookSecret: false, webhookSecretSupported: true };
  }
  const { data, error } = await serviceClient
    .from('tbl_operator_payment_accounts')
    .select('paymongo_webhook_secret')
    .eq('id', accountId)
    .limit(1);

  if (error) {
    if (isMissingColumnError(error)) {
      return { hasWebhookSecret: false, webhookSecretSupported: false };
    }
    throw new Error(error.message || 'Failed to load webhook secret state.');
  }

  const value = String(
    (data?.[0] as { paymongo_webhook_secret?: string | null })
      ?.paymongo_webhook_secret || ''
  ).trim();
  return {
    hasWebhookSecret: !!value,
    webhookSecretSupported: true,
  };
};

export async function GET(req: NextRequest) {
  try {
    const { authClient, serviceClient, token } = getAuthAndServiceClients(req);
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const applicationStatus = await getLatestApplicationStatus(
      serviceClient,
      user.id
    );
    const activeAccount = await getActivePaymentAccount(serviceClient, user.id);
    const webhookState = await readWebhookSecretState(
      serviceClient,
      activeAccount?.id || null
    );

    return NextResponse.json(
      buildStatusPayload({
        applicationStatus,
        activeAccount,
        hasWebhookSecret: webhookState.hasWebhookSecret,
        webhookSecretSupported: webhookState.webhookSecretSupported,
      })
    );
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message === 'missing_auth_token') {
      return NextResponse.json({ error: 'missing_auth_token' }, { status: 401 });
    }
    if (message === 'server_env_missing') {
      return NextResponse.json({ error: 'server_env_missing' }, { status: 500 });
    }
    return NextResponse.json(
      { error: message || 'Unexpected server error.' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { authClient, serviceClient, token } = getAuthAndServiceClients(req);
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      paymongoSecretKey?: string;
      paymongoWebhookSecret?: string;
    };
    const paymongoSecretKey = String(body?.paymongoSecretKey || '').trim();
    const paymongoWebhookSecret = String(body?.paymongoWebhookSecret || '').trim();

    if (!paymongoSecretKey) {
      return NextResponse.json(
        { error: 'PayMongo secret key is required.' },
        { status: 400 }
      );
    }
    if (!paymongoSecretKey.startsWith('sk_') || paymongoSecretKey.length < 12) {
      return NextResponse.json(
        { error: 'Invalid PayMongo secret key format.' },
        { status: 400 }
      );
    }
    if (paymongoWebhookSecret && !paymongoWebhookSecret.startsWith('whsk_')) {
      return NextResponse.json(
        { error: 'Invalid PayMongo webhook secret format.' },
        { status: 400 }
      );
    }

    const existingAccount = await getActivePaymentAccount(serviceClient, user.id);

    const persistWithOptionalWebhook = async (
      operation: 'insert' | 'update',
      targetId?: string
    ) => {
      if (operation === 'update' && targetId) {
        const payloadWithWebhook: Record<string, unknown> = {
          paymongo_secret_key: paymongoSecretKey,
          is_active: true,
        };
        if (paymongoWebhookSecret) {
          payloadWithWebhook.paymongo_webhook_secret = paymongoWebhookSecret;
        }

        const { error } = await serviceClient
          .from('tbl_operator_payment_accounts')
          .update(payloadWithWebhook)
          .eq('id', targetId);

        if (error && isMissingColumnError(error)) {
          const fallbackPayload: Record<string, unknown> = {
            paymongo_secret_key: paymongoSecretKey,
            is_active: true,
          };
          const { error: fallbackError } = await serviceClient
            .from('tbl_operator_payment_accounts')
            .update(fallbackPayload)
            .eq('id', targetId);
          if (fallbackError) {
            throw new Error(
              fallbackError.message || 'Failed to update payment account.'
            );
          }
          return;
        }

        if (error) {
          throw new Error(error.message || 'Failed to update payment account.');
        }
        return;
      }

      const payloadWithWebhook: Record<string, unknown> = {
        operator_user_id: user.id,
        paymongo_secret_key: paymongoSecretKey,
        is_active: true,
      };
      if (paymongoWebhookSecret) {
        payloadWithWebhook.paymongo_webhook_secret = paymongoWebhookSecret;
      }
      const { error } = await serviceClient
        .from('tbl_operator_payment_accounts')
        .insert(payloadWithWebhook);

      if (error && isMissingColumnError(error)) {
        const fallbackPayload: Record<string, unknown> = {
          operator_user_id: user.id,
          paymongo_secret_key: paymongoSecretKey,
          is_active: true,
        };
        const { error: fallbackError } = await serviceClient
          .from('tbl_operator_payment_accounts')
          .insert(fallbackPayload);
        if (fallbackError) {
          throw new Error(
            fallbackError.message || 'Failed to create payment account.'
          );
        }
        return;
      }

      if (error) {
        throw new Error(error.message || 'Failed to create payment account.');
      }
    };

    if (existingAccount?.id) {
      await persistWithOptionalWebhook('update', existingAccount.id);
    } else {
      await persistWithOptionalWebhook('insert');
    }

    const applicationStatus = await getLatestApplicationStatus(
      serviceClient,
      user.id
    );
    const activeAccount = await getActivePaymentAccount(serviceClient, user.id);
    const webhookState = await readWebhookSecretState(
      serviceClient,
      activeAccount?.id || null
    );

    return NextResponse.json(
      buildStatusPayload({
        applicationStatus,
        activeAccount,
        hasWebhookSecret: webhookState.hasWebhookSecret,
        webhookSecretSupported: webhookState.webhookSecretSupported,
      })
    );
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message === 'missing_auth_token') {
      return NextResponse.json({ error: 'missing_auth_token' }, { status: 401 });
    }
    if (message === 'server_env_missing') {
      return NextResponse.json({ error: 'server_env_missing' }, { status: 500 });
    }
    return NextResponse.json(
      { error: message || 'Unexpected server error.' },
      { status: 500 }
    );
  }
}
