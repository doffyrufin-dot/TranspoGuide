import { NextRequest, NextResponse } from 'next/server';
import { requireAdminServiceClient } from '@/lib/server/admin-auth';

type NotificationItem = {
  id: string;
  title: string;
  description: string;
  created_at: string;
};

const toStatus = (message: string) => {
  if (message === 'missing_auth_token' || message === 'unauthorized') return 401;
  if (message === 'forbidden') return 403;
  if (message === 'server_env_missing') return 500;
  return 400;
};

export async function GET(req: NextRequest) {
  try {
    const { serviceClient } = await requireAdminServiceClient(req);

    const { data: appRows, error: appError } = await serviceClient
      .from('tbl_operator_applications')
      .select('id, full_name, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(15);

    if (appError) {
      throw new Error(appError.message || 'Failed to load notifications.');
    }

    const rows = appRows || [];
    const notifications: NotificationItem[] = rows.map((row: any) => ({
      id: `app-${row.id}`,
      title: 'New operator application',
      description: `${row.full_name || 'Applicant'} submitted an application`,
      created_at: row.created_at,
    }));

    return NextResponse.json(
      {
        unreadCount: notifications.length,
        notifications,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=20, stale-while-revalidate=40',
        },
      }
    );
  } catch (error: any) {
    const message = String(error?.message || 'Unexpected error.');
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}

