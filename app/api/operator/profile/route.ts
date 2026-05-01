import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type AnySupabaseClient = SupabaseClient<any, 'public', any>;

const normalizeEmail = (value?: string | null) =>
  String(value || '')
    .trim()
    .toLowerCase();

const isValidAvatarUrl = (value: string) => {
  if (!value) return true;
  const raw = value.trim();
  return (
    raw.startsWith('/') ||
    raw.startsWith('http://') ||
    raw.startsWith('https://')
  );
};

const getClientsAndToken = (req: NextRequest) => {
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

const getOperatorAccess = async (
  serviceClient: AnySupabaseClient,
  userId: string,
  email?: string | null
) => {
  const { data: roleRows, error: roleError } = await serviceClient
    .from('tbl_users')
    .select('role')
    .eq('user_id', userId)
    .limit(1);

  if (roleError) {
    throw new Error(roleError.message || 'Failed to load account role.');
  }

  let role = String(roleRows?.[0]?.role || '')
    .trim()
    .toLowerCase();

  if (!role && email) {
    const { data: byEmailRows, error: byEmailError } = await serviceClient
      .from('tbl_users')
      .select('role')
      .ilike('email', normalizeEmail(email))
      .limit(1);
    if (byEmailError) {
      throw new Error(byEmailError.message || 'Failed to load account role.');
    }
    role = String(byEmailRows?.[0]?.role || '')
      .trim()
      .toLowerCase();
  }

  const { data: appRows, error: appError } = await serviceClient
    .from('tbl_operator_applications')
    .select('status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (appError) {
    throw new Error(appError.message || 'Failed to load application status.');
  }

  const applicationStatus = String(appRows?.[0]?.status || '')
    .trim()
    .toLowerCase();

  const allowed =
    role === 'operator' ||
    applicationStatus === 'approved' ||
    applicationStatus === 'pending' ||
    applicationStatus === 'rejected';

  return {
    allowed,
    applicationStatus:
      applicationStatus === 'pending' ||
      applicationStatus === 'approved' ||
      applicationStatus === 'rejected'
        ? (applicationStatus as 'pending' | 'approved' | 'rejected')
        : null,
  };
};

const readOperatorProfile = async (
  serviceClient: AnySupabaseClient,
  userId: string,
  fallbackEmail?: string | null
) => {
  const { data: userRows, error: userError } = await serviceClient
    .from('tbl_users')
    .select('user_id, email, full_name, avatar_url')
    .eq('user_id', userId)
    .limit(1);

  if (userError) {
    throw new Error(userError.message || 'Failed to load profile.');
  }

  const { data: appRows, error: appError } = await serviceClient
    .from('tbl_operator_applications')
    .select('contact_number, status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (appError) {
    throw new Error(appError.message || 'Failed to load operator contact.');
  }

  const userRow = userRows?.[0] as
    | {
        email?: string | null;
        full_name?: string | null;
        avatar_url?: string | null;
      }
    | undefined;
  const appRow = appRows?.[0] as
    | {
        contact_number?: string | null;
        status?: string | null;
      }
    | undefined;

  const applicationStatus = String(appRow?.status || '')
    .trim()
    .toLowerCase();

  return {
    fullName: String(userRow?.full_name || '').trim(),
    email: String(userRow?.email || fallbackEmail || '').trim(),
    avatarUrl: String(userRow?.avatar_url || '').trim(),
    contactNumber: String(appRow?.contact_number || '').trim(),
    applicationStatus:
      applicationStatus === 'pending' ||
      applicationStatus === 'approved' ||
      applicationStatus === 'rejected'
        ? (applicationStatus as 'pending' | 'approved' | 'rejected')
        : null,
  };
};

export async function GET(req: NextRequest) {
  try {
    const { authClient, serviceClient, token } = getClientsAndToken(req);
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const access = await getOperatorAccess(serviceClient, user.id, user.email);
    if (!access.allowed) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const profile = await readOperatorProfile(serviceClient, user.id, user.email);
    return NextResponse.json(profile);
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
    const { authClient, serviceClient, token } = getClientsAndToken(req);
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const access = await getOperatorAccess(serviceClient, user.id, user.email);
    if (!access.allowed) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const payload = (await req.json().catch(() => ({}))) as {
      fullName?: string;
      avatarUrl?: string;
      contactNumber?: string;
    };

    const fullName = String(payload.fullName || '').trim();
    const avatarUrl = String(payload.avatarUrl || '').trim();
    const contactNumber = String(payload.contactNumber || '').trim();

    if (!fullName) {
      return NextResponse.json(
        { error: 'Full name is required.' },
        { status: 400 }
      );
    }
    if (fullName.length > 120) {
      return NextResponse.json(
        { error: 'Full name is too long.' },
        { status: 400 }
      );
    }
    if (!isValidAvatarUrl(avatarUrl)) {
      return NextResponse.json(
        { error: 'Avatar URL must be a valid http(s) URL or local path.' },
        { status: 400 }
      );
    }
    if (contactNumber && contactNumber.length > 40) {
      return NextResponse.json(
        { error: 'Contact number is too long.' },
        { status: 400 }
      );
    }

    const email = normalizeEmail(user.email || '');
    const { data: updatedRows, error: updateError } = await serviceClient
      .from('tbl_users')
      .update({
        full_name: fullName,
        avatar_url: avatarUrl || null,
        email: email || null,
      })
      .eq('user_id', user.id)
      .select('user_id')
      .limit(1);

    if (updateError) {
      throw new Error(updateError.message || 'Failed to save profile.');
    }

    if (!updatedRows?.length) {
      const { error: insertError } = await serviceClient.from('tbl_users').insert({
        user_id: user.id,
        email: email || null,
        full_name: fullName,
        avatar_url: avatarUrl || null,
        role: 'operator',
      });
      if (insertError) {
        throw new Error(insertError.message || 'Failed to save profile.');
      }
    }

    if (contactNumber) {
      const { data: appRows, error: appReadError } = await serviceClient
        .from('tbl_operator_applications')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (appReadError) {
        throw new Error(appReadError.message || 'Failed to save contact number.');
      }
      const appId = String((appRows?.[0] as { id?: string })?.id || '').trim();
      if (appId) {
        const { error: appUpdateError } = await serviceClient
          .from('tbl_operator_applications')
          .update({ contact_number: contactNumber })
          .eq('id', appId);
        if (appUpdateError) {
          throw new Error(
            appUpdateError.message || 'Failed to save contact number.'
          );
        }
      }
    }

    try {
      await serviceClient.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...(user.user_metadata || {}),
          full_name: fullName,
          avatar_url: avatarUrl || null,
        },
      });
    } catch {
      // Optional sync only; ignore auth metadata update failures.
    }

    const profile = await readOperatorProfile(serviceClient, user.id, user.email);
    return NextResponse.json(profile);
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
