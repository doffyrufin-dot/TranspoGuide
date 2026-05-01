import { NextRequest, NextResponse } from 'next/server';
import { requireAdminServiceClient } from '@/lib/server/admin-auth';

const BACKUP_TABLES = [
  'tbl_users',
  'tbl_vehicle_types',
  'tbl_vehicle_destinations',
  'tbl_destination_vehicle_types',
  'tbl_route_fares',
  'tbl_barangay_fares',
  'tbl_van_queue',
  'tbl_reservations',
  'tbl_reservation_messages',
] as const;

const MAX_ROWS_PER_TABLE = 10000;
const BACKUP_HISTORY_LIMIT = 50;

const toStatus = (message: string) => {
  if (message === 'missing_auth_token' || message === 'unauthorized') return 401;
  if (message === 'forbidden') return 403;
  if (message === 'server_env_missing') return 500;
  if (message === 'invalid_format' || message === 'invalid_table') return 400;
  return 400;
};

const ensureTableAllowed = (table: string) => {
  if (!BACKUP_TABLES.includes(table as (typeof BACKUP_TABLES)[number])) {
    throw new Error('invalid_table');
  }
};

const nowStamp = () => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
};

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

const toSqlLiteral = (value: unknown): string => {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? `${value}` : 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'object') {
    const jsonText = JSON.stringify(value);
    return `'${String(jsonText).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
};

const toCsvValue = (value: unknown) => {
  if (value == null) return '';
  const raw =
    typeof value === 'object' ? JSON.stringify(value) : String(value);
  const escaped = raw.replace(/"/g, '""');
  if (/[",\n\r]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
};

const fetchTableRows = async (supabase: any, table: string) => {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .limit(MAX_ROWS_PER_TABLE);
  if (error) throw new Error(error.message || `load_${table}_failed`);
  return Array.isArray(data) ? data : [];
};

const saveBackupHistory = async (
  supabase: any,
  payload: {
    adminUserId: string;
    format: 'sql' | 'csv';
    tableName: string | null;
    fileName: string | null;
    status: 'success' | 'failed';
    errorMessage?: string | null;
  }
) => {
  const { error } = await supabase.from('tbl_admin_backup_logs').insert({
    admin_user_id: payload.adminUserId,
    format: payload.format,
    table_name: payload.tableName,
    file_name: payload.fileName,
    status: payload.status,
    error_message: payload.errorMessage || null,
  });

  if (!error) return;
  if (error.code === '42P01' || error.code === 'PGRST205') return;
  console.warn('Failed to save backup history:', error.message || error);
};

const loadBackupHistory = async (supabase: any) => {
  const { data, error } = await supabase
    .from('tbl_admin_backup_logs')
    .select('id, format, table_name, file_name, status, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(BACKUP_HISTORY_LIMIT);

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw new Error(error.message || 'history_load_failed');
  }

  return (data || []).map((row: any) => ({
    id: String(row.id || ''),
    at: String(row.created_at || ''),
    format: String(row.format || 'sql').toLowerCase(),
    table: row.table_name ? String(row.table_name) : null,
    fileName: row.file_name ? String(row.file_name) : '',
    status: String(row.status || 'success').toLowerCase(),
    error: row.error_message ? String(row.error_message) : null,
  }));
};

const buildSqlSnapshot = async (supabase: any) => {
  const lines: string[] = [];
  lines.push('-- TranspoGuide admin backup snapshot');
  lines.push(`-- Generated at ${new Date().toISOString()}`);
  lines.push('');

  for (const table of BACKUP_TABLES) {
    const rows = await fetchTableRows(supabase, table);
    lines.push(`-- Table: ${table} (${rows.length} rows)`);
    if (rows.length === 0) {
      lines.push('');
      continue;
    }

    for (const row of rows) {
      const keys = Object.keys(row || {});
      if (keys.length === 0) continue;
      const columns = keys.map((key) => quoteIdentifier(key)).join(', ');
      const values = keys.map((key) => toSqlLiteral((row as any)[key])).join(', ');
      lines.push(
        `INSERT INTO public.${quoteIdentifier(table)} (${columns}) VALUES (${values});`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
};

const buildCsv = async (supabase: any, table: string) => {
  const rows = await fetchTableRows(supabase, table);
  const keysSet = new Set<string>();
  rows.forEach((row: any) => {
    Object.keys(row || {}).forEach((key) => keysSet.add(key));
  });
  const keys = Array.from(keysSet);
  if (keys.length === 0) return '';

  const header = keys.map((key) => toCsvValue(key)).join(',');
  const body = rows
    .map((row: any) => keys.map((key) => toCsvValue(row?.[key])).join(','))
    .join('\n');
  return `${header}\n${body}`;
};

export async function GET(req: NextRequest) {
  const format = String(req.nextUrl.searchParams.get('format') || 'sql')
    .trim()
    .toLowerCase();
  const table = String(
    req.nextUrl.searchParams.get('table') || 'tbl_route_fares'
  ).trim();
  let supabase: any = null;
  let adminUserId = '';

  try {
    const adminCtx = await requireAdminServiceClient(req);
    supabase = adminCtx.serviceClient;
    adminUserId = adminCtx.adminUserId;

    if (format === 'history') {
      const history = await loadBackupHistory(supabase);
      return NextResponse.json({ history });
    }

    if (format === 'sql') {
      const sql = await buildSqlSnapshot(supabase);
      const filename = `transpoguide_backup_${nowStamp()}.sql`;
      await saveBackupHistory(supabase, {
        adminUserId,
        format: 'sql',
        tableName: null,
        fileName: filename,
        status: 'success',
      });
      return new NextResponse(sql, {
        status: 200,
        headers: {
          'Content-Type': 'application/sql; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format === 'csv') {
      ensureTableAllowed(table);
      const csv = await buildCsv(supabase, table);
      const filename = `${table}_backup_${nowStamp()}.csv`;
      await saveBackupHistory(supabase, {
        adminUserId,
        format: 'csv',
        tableName: table,
        fileName: filename,
        status: 'success',
      });
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    throw new Error('invalid_format');
  } catch (error: any) {
    const message = String(error?.message || 'backup_failed');
    if (supabase && adminUserId && (format === 'sql' || format === 'csv')) {
      await saveBackupHistory(supabase, {
        adminUserId,
        format: format === 'csv' ? 'csv' : 'sql',
        tableName: format === 'csv' ? table : null,
        fileName: null,
        status: 'failed',
        errorMessage: message,
      });
    }
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}
