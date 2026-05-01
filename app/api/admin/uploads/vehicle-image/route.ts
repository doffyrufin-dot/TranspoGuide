import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};
const ALLOWED_NAME_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']);

const getAdminServiceClient = async (req: NextRequest) => {
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
  if (!token) throw new Error('missing_auth_token');

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);
  if (userError || !user) throw new Error('unauthorized');

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: roleRows, error: roleError } = await serviceClient
    .from('tbl_users')
    .select('role')
    .eq('user_id', user.id)
    .limit(1);
  if (roleError) throw new Error(roleError.message || 'role_check_failed');

  const role = String(roleRows?.[0]?.role || '').trim().toLowerCase();
  if (role !== 'admin') throw new Error('forbidden');

  return serviceClient;
};

const toStatus = (message: string) => {
  if (message === 'missing_auth_token' || message === 'unauthorized') return 401;
  if (message === 'forbidden') return 403;
  if (message === 'server_env_missing') return 500;
  if (message === 'file_required') return 400;
  if (message === 'unsupported_file_type') return 415;
  if (message === 'file_too_large') return 413;
  return 400;
};

export async function POST(req: NextRequest) {
  try {
    await getAdminServiceClient(req);

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      throw new Error('file_required');
    }

    const mimeType = String(file.type || '').toLowerCase();
    const mimeExtension = ALLOWED_MIME_EXT[mimeType];
    const rawNameExt = path.extname(String(file.name || '').toLowerCase());
    const safeNameExt = ALLOWED_NAME_EXT.has(rawNameExt) ? rawNameExt : '';
    const extension = mimeExtension || safeNameExt;
    if (!extension) {
      throw new Error('unsupported_file_type');
    }
    if (file.size <= 0) {
      throw new Error('file_required');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error('file_too_large');
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const filename = `vehicle-${Date.now()}-${randomUUID()}${extension}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'vehicles');
    const absolutePath = path.join(uploadDir, filename);

    await mkdir(uploadDir, { recursive: true });
    await writeFile(absolutePath, bytes);

    return NextResponse.json({
      url: `/api/uploads/vehicles/${encodeURIComponent(filename)}`,
      filename,
      mimeType,
      size: file.size,
    });
  } catch (error: any) {
    const message = String(error?.message || 'upload_failed');
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}
