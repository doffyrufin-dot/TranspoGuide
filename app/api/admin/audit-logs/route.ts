import { NextRequest, NextResponse } from 'next/server';
import { requireAdminServiceClient } from '@/lib/server/admin-auth';

type AuditLogItem = {
  id: string;
  category: 'application' | 'reservation';
  actor: string;
  summary: string;
  status: string;
  created_at: string;
};

const toIsoDate = (value?: string | null) => {
  const date = new Date(String(value || '').trim());
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const normalizeStatus = (value?: string | null) =>
  String(value || '')
    .trim()
    .toLowerCase();

export async function GET(req: NextRequest) {
  try {
    const { serviceClient } = await requireAdminServiceClient(req);

    const [{ data: appRows, error: appError }, { data: reservationRows, error: reservationError }] =
      await Promise.all([
        serviceClient
          .from('tbl_operator_applications')
          .select('id, full_name, status, created_at')
          .in('status', ['approved', 'rejected'])
          .order('created_at', { ascending: false })
          .limit(20),
        serviceClient
          .from('tbl_reservations')
          .select('id, full_name, route, status, operator_user_id, created_at, updated_at')
          .in('status', ['pending_operator_approval', 'confirmed', 'rejected', 'picked_up', 'departed'])
          .order('updated_at', { ascending: false })
          .limit(30),
      ]);

    if (appError) {
      return NextResponse.json(
        { error: appError.message || 'Failed to load audit logs.' },
        { status: 500 }
      );
    }
    if (reservationError) {
      return NextResponse.json(
        { error: reservationError.message || 'Failed to load audit logs.' },
        { status: 500 }
      );
    }

    const operatorIds = Array.from(
      new Set(
        (reservationRows || [])
          .map((row: any) => String(row.operator_user_id || '').trim())
          .filter(Boolean)
      )
    );
    let operatorsMap = new Map<string, string>();

    if (operatorIds.length) {
      const { data: operatorRows, error: operatorError } = await serviceClient
        .from('tbl_users')
        .select('user_id, full_name')
        .in('user_id', operatorIds);
      if (operatorError) {
        return NextResponse.json(
          { error: operatorError.message || 'Failed to load audit logs.' },
          { status: 500 }
        );
      }
      operatorsMap = new Map(
        (operatorRows || []).map((row: any) => [
          String(row.user_id || '').trim(),
          String(row.full_name || '').trim() || 'Operator',
        ])
      );
    }

    const appLogs: AuditLogItem[] = (appRows || []).map((row: any) => {
      const status = normalizeStatus(row.status);
      return {
        id: `app-${row.id}`,
        category: 'application',
        actor: 'Admin',
        summary: `${String(row.full_name || 'Applicant').trim()} application ${status}`,
        status,
        created_at: toIsoDate(row.created_at) || new Date().toISOString(),
      };
    });

    const reservationLogs: AuditLogItem[] = (reservationRows || []).map((row: any) => {
      const status = normalizeStatus(row.status);
      const operatorId = String(row.operator_user_id || '').trim();
      const actor = operatorId ? operatorsMap.get(operatorId) || 'Operator' : 'System';
      const summary = `${String(row.full_name || 'Passenger').trim()} - ${String(
        row.route || 'Route'
      ).trim()} (${status})`;
      return {
        id: `res-${row.id}-${status}`,
        category: 'reservation',
        actor,
        summary,
        status,
        created_at:
          toIsoDate(row.updated_at) ||
          toIsoDate(row.created_at) ||
          new Date().toISOString(),
      };
    });

    const logs = [...appLogs, ...reservationLogs]
      .sort((a, b) => {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return bTime - aTime;
      })
      .slice(0, 40);

    return NextResponse.json(
      {
        logs,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=20, stale-while-revalidate=40',
        },
      }
    );
  } catch (error: any) {
    const message = String(error?.message || 'Unexpected error.');
    const status =
      message === 'missing_auth_token' || message === 'unauthorized'
        ? 401
        : message === 'forbidden'
          ? 403
          : message === 'server_env_missing'
            ? 500
            : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
