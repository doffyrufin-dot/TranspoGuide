'use client';

import React, { useEffect, useMemo, useState } from 'react';
import sileoToast from '@/lib/utils/sileo-toast';

type BookingRow = {
  id: string;
  passenger: string;
  contact: string;
  route: string;
  seats: number;
  amount: number;
  status: 'Pending' | 'Confirmed' | 'Cancelled';
  raw_status: string;
  created_at: string;
  paid_at: string | null;
  operator_name: string;
  operator_email: string;
  queue_status: string;
  plate_number: string;
};

type Props = {
  accessToken: string;
};

const BOOKINGS_POLL_MS = 30000;
const isDocumentVisible = () =>
  typeof document === 'undefined' || document.visibilityState === 'visible';

export default function BookingsTab({ accessToken }: Props) {
  const [scope, setScope] = useState<'boarding' | 'active'>('boarding');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Confirmed' | 'Cancelled'>('All');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BookingRow[]>([]);

  const loadBookings = async (silent = false) => {
    if (!accessToken) return;
    try {
      if (!silent) setLoading(true);
      const params = new URLSearchParams({ scope });
      const res = await fetch(`/api/admin/reservations?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load reservations.');
      }
      setRows((data.bookings || []) as BookingRow[]);
    } catch (err: any) {
      if (!silent) {
        sileoToast.error({
          title: 'Failed to load reservations',
          description: err?.message || 'Please try again.',
        });
      }
      setRows([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadBookings(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    const timer = window.setInterval(() => {
      if (!isDocumentVisible()) return;
      void loadBookings(true);
    }, BOOKINGS_POLL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, accessToken]);

  const filtered = useMemo(() => {
    if (statusFilter === 'All') return rows;
    return rows.filter((row) => row.status === statusFilter);
  }, [rows, statusFilter]);

  const statusStyle = (status: BookingRow['status']) =>
    status === 'Confirmed'
      ? { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' }
      : status === 'Pending'
        ? { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' }
        : { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' };

  const formatPeso = (value: number) =>
    `PHP ${Number(value || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const formatTime = (value: string | null) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('en-PH');
  };

  return (
    <div className="admin-tab">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-theme">Booking Requests</h1>
          <p className="text-muted-theme text-sm">
            {scope === 'boarding'
              ? 'Showing reservations for vans currently boarding'
              : 'Showing reservations for queued + boarding vans'}
          </p>
        </div>
        <button
          onClick={() => void loadBookings(false)}
          className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
          style={{
            background: 'var(--tg-subtle)',
            color: 'var(--primary)',
            border: '1px solid var(--tg-border-primary)',
            opacity: loading ? 0.7 : 1,
          }}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { key: 'boarding', label: 'Boarding Vans' },
          { key: 'active', label: 'Queued + Boarding' },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setScope(item.key as 'boarding' | 'active')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              scope === item.key ? 'text-white' : 'text-muted-theme'
            }`}
            style={
              scope === item.key
                ? { background: 'var(--primary)' }
                : { background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {(['All', 'Pending', 'Confirmed', 'Cancelled'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              statusFilter === status ? 'text-white' : 'text-muted-theme'
            }`}
            style={
              statusFilter === status
                ? { background: 'var(--primary)' }
                : { background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }
            }
          >
            {status}
          </button>
        ))}
      </div>

      <div className="card-glow rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--tg-border)' }}>
                <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                  Reservation
                </th>
                <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                  Passenger
                </th>
                <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                  Operator
                </th>
                <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                  Trip
                </th>
                <th className="text-center p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                  Seats
                </th>
                <th className="text-right p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                  Amount
                </th>
                <th className="text-center p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                filtered.map((row) => {
                  const st = statusStyle(row.status);
                  return (
                    <tr
                      key={row.id}
                      style={{ borderBottom: '1px solid var(--tg-border)' }}
                      className="hover:bg-[var(--tg-subtle)] transition-colors"
                    >
                      <td className="p-4">
                        <p className="font-mono text-xs text-muted-theme">#{row.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-theme">Paid: {formatTime(row.paid_at)}</p>
                      </td>
                      <td className="p-4">
                        <p className="text-theme font-semibold">{row.passenger}</p>
                        <p className="text-muted-theme text-xs">{row.contact}</p>
                      </td>
                      <td className="p-4">
                        <p className="text-theme font-semibold">{row.operator_name}</p>
                        <p className="text-muted-theme text-xs">{row.plate_number}</p>
                      </td>
                      <td className="p-4">
                        <p className="text-theme font-medium">{row.route}</p>
                        <p className="text-muted-theme text-xs uppercase">{row.queue_status}</p>
                      </td>
                      <td className="p-4 text-center text-theme font-bold">{row.seats}</td>
                      <td className="p-4 text-right text-theme font-bold">{formatPeso(row.amount)}</td>
                      <td className="p-4 text-center">
                        <span
                          className="px-2.5 py-1 rounded-full text-xs font-bold"
                          style={{ background: st.bg, color: st.color }}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="p-6 text-sm text-muted-theme">Loading reservations...</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-6 text-sm text-muted-theme">
            No reservations found for this filter.
          </div>
        )}
      </div>
    </div>
  );
}
