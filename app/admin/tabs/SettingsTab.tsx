'use client';

import React, { useCallback, useEffect, useState } from 'react';

export type AdminApplicationsFilter =
  | 'All'
  | 'Pending'
  | 'Approved'
  | 'Rejected';

export type AdminDashboardSettings = {
  notificationSoundEnabled: boolean;
  autoOpenApplicationsOnNew: boolean;
  defaultApplicationsFilter: AdminApplicationsFilter;
};

type AuditLogItem = {
  id: string;
  category: 'application' | 'reservation';
  actor: string;
  summary: string;
  status: string;
  created_at: string;
};

type BackupHistoryItem = {
  id: string;
  at: string;
  format: 'sql' | 'csv';
  table: string | null;
  fileName: string;
  status: 'success' | 'failed';
  error: string | null;
};

const FILTER_OPTIONS: AdminApplicationsFilter[] = [
  'All',
  'Pending',
  'Approved',
  'Rejected',
];

const AUDIT_LOGS_POLL_MS = 60000;
const BACKUP_TABLE_OPTIONS = [
  'tbl_users',
  'tbl_vehicle_types',
  'tbl_vehicle_destinations',
  'tbl_destination_vehicle_types',
  'tbl_route_fares',
  'tbl_barangay_fares',
  'tbl_van_queue',
  'tbl_reservations',
  'tbl_reservation_messages',
];
const isDocumentVisible = () =>
  typeof document === 'undefined' || document.visibilityState === 'visible';

export default function SettingsTab({
  accessToken,
  settings,
  onSettingsChange,
}: {
  accessToken: string;
  settings: AdminDashboardSettings;
  onSettingsChange: (next: AdminDashboardSettings) => void;
}) {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [backupLoading, setBackupLoading] = useState<'sql' | 'csv' | ''>('');
  const [csvTable, setCsvTable] = useState('tbl_route_fares');
  const [backupHistory, setBackupHistory] = useState<BackupHistoryItem[]>([]);
  const [backupHistoryLoading, setBackupHistoryLoading] = useState(false);

  const loadLogs = useCallback(
    async (silent = false) => {
      if (!accessToken) return;
      try {
        if (!silent) setLoading(true);
        setError('');
        const res = await fetch('/api/admin/audit-logs', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load audit logs.');
        }
        setLogs(Array.isArray(data?.logs) ? data.logs : []);
      } catch (err: any) {
        if (!silent) {
          setError(err?.message || 'Failed to load audit logs.');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [accessToken]
  );

  useEffect(() => {
    void loadLogs(false);
  }, [loadLogs]);

  useEffect(() => {
    if (!accessToken) return;
    const timer = window.setInterval(() => {
      if (!isDocumentVisible()) return;
      void loadLogs(true);
    }, AUDIT_LOGS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [accessToken, loadLogs]);

  const loadBackupHistory = useCallback(
    async (silent = false) => {
      if (!accessToken) return;
      try {
        if (!silent) setBackupHistoryLoading(true);
        const res = await fetch('/api/admin/backups?format=history', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load backup history.');
        }
        setBackupHistory(Array.isArray(data?.history) ? data.history : []);
      } catch {
        if (!silent) {
          setBackupHistory([]);
        }
      } finally {
        if (!silent) setBackupHistoryLoading(false);
      }
    },
    [accessToken]
  );

  useEffect(() => {
    void loadBackupHistory(false);
  }, [loadBackupHistory]);

  const extractFilename = (value: string | null) => {
    const fallback = `backup_${new Date().toISOString()}`;
    if (!value) return fallback;
    const match = value.match(/filename="?([^"]+)"?/i);
    if (!match?.[1]) return fallback;
    return match[1];
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const downloadBackup = async (format: 'sql' | 'csv') => {
    if (!accessToken || backupLoading) return;
    try {
      setBackupLoading(format);
      const query =
        format === 'csv'
          ? `?format=csv&table=${encodeURIComponent(csvTable)}`
          : '?format=sql';
      const res = await fetch(`/api/admin/backups${query}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || 'Backup export failed.');
      }

      const blob = await res.blob();
      const filename = extractFilename(res.headers.get('content-disposition'));
      triggerDownload(blob, filename);
    } catch {
      // Backup failures are logged by API to shared history table.
    } finally {
      setBackupLoading('');
      void loadBackupHistory(true);
    }
  };

  return (
    <div className="admin-tab space-y-6">
      <div className="card-glow p-5 rounded-2xl">
        <h3 className="text-theme font-bold text-lg">Dashboard Preferences</h3>
        <p className="text-sm text-muted-theme mt-1">
          These preferences control your admin dashboard behavior.
        </p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() =>
              onSettingsChange({
                ...settings,
                notificationSoundEnabled: !settings.notificationSoundEnabled,
              })
            }
            className="rounded-xl p-3 text-left transition cursor-pointer"
            style={{
              background: 'var(--tg-bg-alt)',
              border: '1px solid var(--tg-border)',
            }}
          >
            <p className="text-xs text-muted-theme uppercase tracking-wider mb-1">
              Notification Sound
            </p>
            <p
              className="text-sm font-semibold"
              style={{
                color: settings.notificationSoundEnabled ? '#22c55e' : '#ef4444',
              }}
            >
              {settings.notificationSoundEnabled ? 'Enabled' : 'Disabled'}
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              onSettingsChange({
                ...settings,
                autoOpenApplicationsOnNew: !settings.autoOpenApplicationsOnNew,
              })
            }
            className="rounded-xl p-3 text-left transition cursor-pointer"
            style={{
              background: 'var(--tg-bg-alt)',
              border: '1px solid var(--tg-border)',
            }}
          >
            <p className="text-xs text-muted-theme uppercase tracking-wider mb-1">
              Auto-open Applications
            </p>
            <p
              className="text-sm font-semibold"
              style={{
                color: settings.autoOpenApplicationsOnNew ? '#22c55e' : '#ef4444',
              }}
            >
              {settings.autoOpenApplicationsOnNew ? 'Enabled' : 'Disabled'}
            </p>
          </button>
        </div>

        <div className="mt-4">
          <label className="block text-xs text-muted-theme uppercase tracking-wider mb-1.5">
            Default Applications Filter
          </label>
          <select
            value={settings.defaultApplicationsFilter}
            onChange={(e) =>
              onSettingsChange({
                ...settings,
                defaultApplicationsFilter:
                  (e.target.value as AdminApplicationsFilter) || 'All',
              })
            }
            className="w-full md:w-72 px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: 'var(--tg-bg-alt)',
              border: '1px solid var(--tg-border)',
              color: 'var(--tg-text)',
            }}
          >
            {FILTER_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card-glow p-5 rounded-2xl">
        <h3 className="text-theme font-bold text-lg">Approval & Payment Policy</h3>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div
            className="rounded-xl p-3"
            style={{
              background: 'var(--tg-bg-alt)',
              border: '1px solid var(--tg-border)',
            }}
          >
            <p className="text-xs text-muted-theme uppercase tracking-wider mb-1">
              Operator Approval Guard
            </p>
            <p className="font-semibold text-theme">
              Require PayMongo setup before reservation confirm
            </p>
          </div>
          <div
            className="rounded-xl p-3"
            style={{
              background: 'var(--tg-bg-alt)',
              border: '1px solid var(--tg-border)',
            }}
          >
            <p className="text-xs text-muted-theme uppercase tracking-wider mb-1">
              Downpayment Routing
            </p>
            <p className="font-semibold text-theme">
              Uses operator key when reservation is operator-linked
            </p>
          </div>
        </div>
      </div>

      <div className="card-glow p-5 rounded-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-theme font-bold text-lg">Database Backup</h3>
            <p className="text-xs text-muted-theme">
              Download SQL snapshot or table CSV export (admin-only).
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            className="rounded-xl p-3"
            style={{
              background: 'var(--tg-bg-alt)',
              border: '1px solid var(--tg-border)',
            }}
          >
            <p className="text-xs text-muted-theme uppercase tracking-wider mb-2">
              Full SQL Snapshot
            </p>
            <button
              type="button"
              onClick={() => void downloadBackup('sql')}
              disabled={backupLoading !== ''}
              className="px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-60"
              style={{
                background: 'var(--tg-subtle)',
                color: 'var(--primary)',
                border: '1px solid var(--tg-border-primary)',
              }}
            >
              {backupLoading === 'sql' ? 'Preparing SQL...' : 'Download .sql'}
            </button>
          </div>

          <div
            className="rounded-xl p-3"
            style={{
              background: 'var(--tg-bg-alt)',
              border: '1px solid var(--tg-border)',
            }}
          >
            <p className="text-xs text-muted-theme uppercase tracking-wider mb-2">
              Table CSV Export
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={csvTable}
                onChange={(e) => setCsvTable(e.target.value)}
                className="px-3 py-2 rounded-lg text-xs outline-none"
                style={{
                  background: 'var(--tg-bg)',
                  border: '1px solid var(--tg-border)',
                  color: 'var(--tg-text)',
                }}
                disabled={backupLoading !== ''}
              >
                {BACKUP_TABLE_OPTIONS.map((table) => (
                  <option key={table} value={table}>
                    {table}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void downloadBackup('csv')}
                disabled={backupLoading !== ''}
                className="px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-60"
                style={{
                  background: 'var(--tg-subtle)',
                  color: 'var(--primary)',
                  border: '1px solid var(--tg-border-primary)',
                }}
              >
                {backupLoading === 'csv' ? 'Preparing CSV...' : 'Download .csv'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs text-muted-theme uppercase tracking-wider mb-2">
            Backup History
          </p>
          {backupHistoryLoading ? (
            <p className="text-sm text-muted-theme">Loading backup history...</p>
          ) : backupHistory.length === 0 ? (
            <p className="text-sm text-muted-theme">No backup runs yet.</p>
          ) : (
            <div className="space-y-2">
              {backupHistory.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl p-3"
                  style={{
                    background: 'var(--tg-bg-alt)',
                    border: '1px solid var(--tg-border)',
                  }}
                >
                  <p className="text-sm font-semibold text-theme">
                    {item.status === 'success' ? 'Success' : 'Failed'} -{' '}
                    {item.format.toUpperCase()}
                    {item.table ? ` (${item.table})` : ''}
                  </p>
                  <p className="text-xs text-muted-theme mt-1">
                    {new Date(item.at).toLocaleString('en-PH')}
                  </p>
                  {item.fileName ? (
                    <p className="text-xs text-muted-theme mt-1">
                      File: {item.fileName}
                    </p>
                  ) : null}
                  {item.error ? (
                    <p className="text-xs mt-1" style={{ color: '#ef4444' }}>
                      {item.error}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card-glow p-5 rounded-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-theme font-bold text-lg">Recent Audit Logs</h3>
            <p className="text-xs text-muted-theme">
              Latest application and reservation state changes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadLogs(false)}
            disabled={loading}
            className="px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-60"
            style={{
              background: 'var(--tg-subtle)',
              color: 'var(--primary)',
              border: '1px solid var(--tg-border-primary)',
            }}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-theme mt-4">Loading logs...</p>
        ) : error ? (
          <p className="text-sm mt-4" style={{ color: '#ef4444' }}>
            {error}
          </p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-theme mt-4">No audit entries yet.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {logs.slice(0, 20).map((log) => (
              <div
                key={log.id}
                className="rounded-xl p-3"
                style={{
                  background: 'var(--tg-bg-alt)',
                  border: '1px solid var(--tg-border)',
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-theme">{log.summary}</p>
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full uppercase tracking-wide"
                    style={{
                      background:
                        log.category === 'application'
                          ? 'rgba(59,130,246,0.12)'
                          : 'rgba(34,197,94,0.12)',
                      color:
                        log.category === 'application' ? 'var(--primary)' : '#22c55e',
                    }}
                  >
                    {log.category}
                  </span>
                </div>
                <p className="text-xs text-muted-theme mt-1">
                  By: {log.actor} | {new Date(log.created_at).toLocaleString('en-PH')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
