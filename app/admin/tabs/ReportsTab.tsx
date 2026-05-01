'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarRange,
  CircleDollarSign,
  ClipboardList,
  Download,
  ReceiptText,
} from 'lucide-react';
import sileoToast from '@/lib/utils/sileo-toast';

type ReportBooking = {
  reservation_id: string;
  reservation_code: string;
  passenger_name: string;
  contact_number: string;
  pickup_location: string;
  route: string;
  seat_labels: string[];
  seat_count: number;
  amount_due: number;
  status: string;
  is_discounted: boolean;
  payment_id: string | null;
  paid_at: string | null;
  created_at: string;
  operator_name: string;
  operator_email: string;
  plate_number: string;
  queue_status: string;
};

type ReportPayment = {
  reservation_id: string;
  reservation_code: string;
  payment_id: string;
  paid_at: string;
  passenger_name: string;
  route: string;
  seat_count: number;
  amount_due: number;
  status: string;
  is_discounted: boolean;
  operator_name: string;
};

type ReportApplication = {
  application_id: string;
  applicant_name: string;
  email: string;
  contact_number: string;
  address: string;
  plate_number: string;
  vehicle_model: string;
  seating_capacity: number;
  status: string;
  admin_notes: string;
  created_at: string;
  user_id: string;
};

type ReportsResponse = {
  range: {
    from: string;
    to: string;
  };
  summary: {
    bookings: number;
    payments: number;
    applications: number;
    total_revenue: number;
    passengers_total: number;
    passengers_boarded: number;
    passengers_discounted: number;
  };
  bookings: ReportBooking[];
  payments: ReportPayment[];
      applications: ReportApplication[];
};

type Props = {
  accessToken: string;
};

const formatDateInput = (value: Date) => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatPeso = (value: number) =>
  `PHP ${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-PH');
};

const escapeCsv = (value: unknown) => {
  if (Array.isArray(value)) return escapeCsv(value.join(' | '));
  const raw = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

const downloadCsv = (
  filename: string,
  headers: string[],
  rows: Array<Record<string, unknown>>
) => {
  const headerLine = headers.join(',');
  const bodyLines = rows.map((row) => headers.map((key) => escapeCsv(row[key])).join(','));
  const csv = [headerLine, ...bodyLines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default function ReportsTab({ accessToken }: Props) {
  const now = useMemo(() => new Date(), []);
  const defaultTo = useMemo(() => formatDateInput(now), [now]);
  const defaultFrom = useMemo(() => {
    const from = new Date(now);
    from.setDate(now.getDate() - 29);
    return formatDateInput(from);
  }, [now]);

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<ReportsResponse | null>(null);

  const loadReports = async (silent = false) => {
    if (!accessToken) return;
    try {
      if (!silent) setLoading(true);
      const params = new URLSearchParams({ from: fromDate, to: toDate });
      const res = await fetch(`/api/admin/reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const data = (await res.json()) as ReportsResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load reports.');
      }
      setReports(data);
    } catch (error: any) {
      if (!silent) {
        sileoToast.error({
          title: 'Failed to load reports',
          description: error?.message || 'Please try again.',
        });
      }
      setReports(null);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const exportBookings = () => {
    const rows = reports?.bookings || [];
    if (!rows.length) {
      sileoToast.info({ title: 'No booking rows to export yet.' });
      return;
    }
    const mapped = rows.map((row) => ({
      reservation_code: row.reservation_code,
      reservation_id: row.reservation_id,
      passenger_name: row.passenger_name,
      contact_number: row.contact_number,
      pickup_location: row.pickup_location,
      route: row.route,
      seat_labels: row.seat_labels.join(' | '),
      seat_count: row.seat_count,
      amount_due: row.amount_due,
      status: row.status,
      is_discounted: row.is_discounted ? 'yes' : 'no',
      payment_id: row.payment_id || '',
      paid_at: row.paid_at || '',
      created_at: row.created_at,
      operator_name: row.operator_name,
      operator_email: row.operator_email,
      plate_number: row.plate_number,
      queue_status: row.queue_status,
    }));
    downloadCsv(
      `admin_bookings_${fromDate}_to_${toDate}.csv`,
      Object.keys(mapped[0]),
      mapped
    );
    sileoToast.success({ title: 'Bookings CSV exported' });
  };

  const exportPayments = () => {
    const rows = reports?.payments || [];
    if (!rows.length) {
      sileoToast.info({ title: 'No payment rows to export yet.' });
      return;
    }
    const mapped = rows.map((row) => ({
      reservation_code: row.reservation_code,
      reservation_id: row.reservation_id,
      payment_id: row.payment_id,
      paid_at: row.paid_at,
      passenger_name: row.passenger_name,
      route: row.route,
      seat_count: row.seat_count,
      amount_due: row.amount_due,
      status: row.status,
      is_discounted: row.is_discounted ? 'yes' : 'no',
      operator_name: row.operator_name,
    }));
    downloadCsv(
      `admin_payments_${fromDate}_to_${toDate}.csv`,
      Object.keys(mapped[0]),
      mapped
    );
    sileoToast.success({ title: 'Payments CSV exported' });
  };

  const exportApplications = () => {
    const rows = reports?.applications || [];
    if (!rows.length) {
      sileoToast.info({ title: 'No application rows to export yet.' });
      return;
    }
    const mapped = rows.map((row) => ({
      application_id: row.application_id,
      applicant_name: row.applicant_name,
      email: row.email,
      contact_number: row.contact_number,
      address: row.address,
      plate_number: row.plate_number,
      vehicle_model: row.vehicle_model,
      seating_capacity: row.seating_capacity,
      status: row.status,
      admin_notes: row.admin_notes,
      created_at: row.created_at,
      user_id: row.user_id,
    }));
    downloadCsv(
      `admin_applications_${fromDate}_to_${toDate}.csv`,
      Object.keys(mapped[0]),
      mapped
    );
    sileoToast.success({ title: 'Applications CSV exported' });
  };

  return (
    <div className="admin-tab space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-theme">Reports</h1>
          <p className="text-muted-theme text-sm">
            Export bookings, payments, and applications into CSV.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <label className="text-xs text-muted-theme font-semibold uppercase tracking-wider">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="input-dark mt-1 w-full sm:w-auto"
            />
          </label>
          <label className="text-xs text-muted-theme font-semibold uppercase tracking-wider">
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="input-dark mt-1 w-full sm:w-auto"
            />
          </label>
          <button
            onClick={() => void loadReports(false)}
            disabled={loading}
            className="btn-primary h-[42px] mt-0 sm:mt-[20px] disabled:opacity-60"
          >
            <CalendarRange size={15} /> Apply
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="card-glow p-4 rounded-2xl">
          <p className="text-xs text-muted-theme font-semibold uppercase tracking-wider">
            Bookings
          </p>
          <p className="text-2xl font-extrabold text-theme mt-1">
            {loading ? '...' : reports?.summary.bookings || 0}
          </p>
        </div>
        <div className="card-glow p-4 rounded-2xl">
          <p className="text-xs text-muted-theme font-semibold uppercase tracking-wider">
            Payments
          </p>
          <p className="text-2xl font-extrabold text-theme mt-1">
            {loading ? '...' : reports?.summary.payments || 0}
          </p>
        </div>
        <div className="card-glow p-4 rounded-2xl">
          <p className="text-xs text-muted-theme font-semibold uppercase tracking-wider">
            Applications
          </p>
          <p className="text-2xl font-extrabold text-theme mt-1">
            {loading ? '...' : reports?.summary.applications || 0}
          </p>
        </div>
        <div className="card-glow p-4 rounded-2xl">
          <p className="text-xs text-muted-theme font-semibold uppercase tracking-wider">
            Total Passengers
          </p>
          <p className="text-2xl font-extrabold text-theme mt-1">
            {loading ? '...' : reports?.summary.passengers_total || 0}
          </p>
          <p className="text-[11px] text-muted-theme mt-1">
            All seats reserved
          </p>
        </div>
        <div className="card-glow p-4 rounded-2xl">
          <p className="text-xs text-muted-theme font-semibold uppercase tracking-wider">
            Boarded / Discounted
          </p>
          <p className="text-2xl font-extrabold text-theme mt-1">
            {loading
              ? '...'
              : `${reports?.summary.passengers_boarded || 0} / ${reports?.summary.passengers_discounted || 0}`}
          </p>
          <p className="text-[11px] text-muted-theme mt-1">
            Confirmed seats / discounted seats
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card-glow rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ReceiptText size={16} style={{ color: 'var(--primary)' }} />
              <h3 className="text-theme font-bold">Bookings</h3>
            </div>
            <button
              onClick={exportBookings}
              className="btn-primary shadow-none text-xs py-1.5 px-3"
            >
              <Download size={13} /> CSV
            </button>
          </div>
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {(reports?.bookings || []).slice(0, 8).map((row) => (
              <div
                key={row.reservation_id}
                className="p-3 rounded-xl"
                style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}
              >
                <p className="text-sm font-semibold text-theme">{row.passenger_name}</p>
                <p className="text-xs text-muted-theme">{row.route}</p>
                <p className="text-xs text-muted-theme">
                  {row.seat_count} seat(s) · {formatPeso(row.amount_due)}
                </p>
              </div>
            ))}
            {!loading && !(reports?.bookings || []).length && (
              <p className="text-sm text-muted-theme">No booking rows in selected range.</p>
            )}
          </div>
        </div>

        <div className="card-glow rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CircleDollarSign size={16} style={{ color: 'var(--primary)' }} />
              <h3 className="text-theme font-bold">Payments</h3>
            </div>
            <button
              onClick={exportPayments}
              className="btn-primary shadow-none text-xs py-1.5 px-3"
            >
              <Download size={13} /> CSV
            </button>
          </div>
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {(reports?.payments || []).slice(0, 8).map((row) => (
              <div
                key={`${row.reservation_id}-${row.payment_id}`}
                className="p-3 rounded-xl"
                style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}
              >
                <p className="text-sm font-semibold text-theme">{row.passenger_name}</p>
                <p className="text-xs text-muted-theme">
                  Ref: {row.payment_id || 'N/A'} · {formatPeso(row.amount_due)}
                </p>
                <p className="text-xs text-muted-theme">{formatDateTime(row.paid_at)}</p>
              </div>
            ))}
            {!loading && !(reports?.payments || []).length && (
              <p className="text-sm text-muted-theme">No payment rows in selected range.</p>
            )}
          </div>
        </div>

        <div className="card-glow rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ClipboardList size={16} style={{ color: 'var(--primary)' }} />
              <h3 className="text-theme font-bold">Applications</h3>
            </div>
            <button
              onClick={exportApplications}
              className="btn-primary shadow-none text-xs py-1.5 px-3"
            >
              <Download size={13} /> CSV
            </button>
          </div>
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {(reports?.applications || []).slice(0, 8).map((row) => (
              <div
                key={row.application_id}
                className="p-3 rounded-xl"
                style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}
              >
                <p className="text-sm font-semibold text-theme">{row.applicant_name}</p>
                <p className="text-xs text-muted-theme">
                  {row.vehicle_model} · {row.plate_number}
                </p>
                <p className="text-xs text-muted-theme uppercase">{row.status}</p>
              </div>
            ))}
            {!loading && !(reports?.applications || []).length && (
              <p className="text-sm text-muted-theme">No application rows in selected range.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
