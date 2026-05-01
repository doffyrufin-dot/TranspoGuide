'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { Bus, ClipboardList, Eye, FileText, UserCheck, UserX, X } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import sileoToast from '@/lib/utils/sileo-toast';

interface Application {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  contact_number: string;
  address: string;
  plate_number: string;
  vehicle_model: string;
  seating_capacity: number;
  drivers_license_url: string | null;
  vehicle_registration_url: string | null;
  franchise_cert_url: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

type FilterType = 'All' | 'Pending' | 'Approved' | 'Rejected';

export default function ApplicationsTab({
  initialFilter = 'All',
  filterNonce = 0,
}: {
  initialFilter?: FilterType;
  filterNonce?: number;
}) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Application | null>(null);
  const [filter, setFilter] = useState<FilterType>(initialFilter);
  const [adminNotes, setAdminNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 5;

  const fetchApplications = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tbl_operator_applications')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setApplications(data as Application[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter, filterNonce]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, applications.length]);

  const handleStatusUpdate = async (
    id: string,
    status: 'approved' | 'rejected'
  ) => {
    setUpdating(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        sileoToast.error({
          title: 'Session expired',
          description: 'Please login again.',
        });
        setUpdating(false);
        return;
      }

      const response = await fetch('/api/admin/applications/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          applicationId: id,
          status,
          adminNotes: adminNotes || null,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        sileoToast.error({
          title: 'Something went wrong',
          description: 'Failed to update application status.',
        });
        setUpdating(false);
        return;
      }

      sileoToast.success({
        title: `Application ${status} successfully`,
      });

      if (!result.emailSent) {
        sileoToast.warning({
          title: 'Notification email failed',
          description: result?.emailError || 'Please check your email sender setup.',
        });
      } else if (result?.emailMode === 'testing') {
        sileoToast.info({
          title: 'Email notification is in free test mode',
          description: 'Applicants should check login page status.',
        });
      } else if (result?.emailTo) {
        sileoToast.info({
          title: 'Notification email queued',
          description: `Recipient: ${result.emailTo}`,
        });
      }

      await fetchApplications();
      setSelected(null);
      setAdminNotes('');
      setPreviewUrl(null);
    } catch {
      sileoToast.error({
        title: 'Something went wrong',
        description: 'Please try again later.',
      });
    }
    setUpdating(false);
  };

  const filtered =
    filter === 'All'
      ? applications
      : applications.filter((a) => a.status === filter.toLowerCase());
  const totalPages =
    filter === 'All' ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) : 1;
  const paginated =
    filter === 'All'
      ? filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
      : filtered;
  const counts: Record<string, number> = {
    All: applications.length,
    Pending: applications.filter((a) => a.status === 'pending').length,
    Approved: applications.filter((a) => a.status === 'approved').length,
    Rejected: applications.filter((a) => a.status === 'rejected').length,
  };

  const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
    pending: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' },
    approved: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' },
    rejected: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' },
  };

  return (
    <div className="admin-tab">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold text-theme">Operator Applications</h1>
          <p className="text-muted-theme text-sm">
            Review and manage van operator registration requests
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--tg-muted)' }}>
            Note: If email delivery fails, applicants can still check live status on the login page.
          </p>
        </div>
        <span className="text-sm text-muted-theme font-medium">
          {applications.length} total
        </span>
      </div>

      <div className="flex gap-2 mb-6">
        {(['All', 'Pending', 'Approved', 'Rejected'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer
              ${filter === s ? 'text-white' : 'text-muted-theme'}`}
            style={
              filter === s
                ? { background: 'var(--primary)' }
                : { background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }
            }
          >
            {s} ({counts[s]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <svg
            className="animate-spin h-8 w-8"
            style={{ color: 'var(--primary)' }}
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-glow rounded-2xl p-16 flex flex-col items-center gap-3 text-center">
          <ClipboardList size={36} className="text-muted-theme opacity-40" />
          <p className="text-muted-theme text-sm">
            No {filter === 'All' ? '' : filter.toLowerCase()} applications found
          </p>
        </div>
      ) : (
        <div className="card-glow rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '2px solid var(--tg-border)' }}>
                  <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                    Applicant
                  </th>
                  <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                    Vehicle
                  </th>
                  <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                    Date
                  </th>
                  <th className="text-center p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                    Docs
                  </th>
                  <th className="text-center p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-right p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((app) => {
                  const docCount = [
                    app.drivers_license_url,
                    app.vehicle_registration_url,
                    app.franchise_cert_url,
                  ].filter(Boolean).length;
                  const st = STATUS_STYLES[app.status] || STATUS_STYLES.pending;
                  return (
                    <tr
                      key={app.id}
                      style={{ borderBottom: '1px solid var(--tg-border)' }}
                      className="hover:bg-[var(--tg-subtle)] transition-colors"
                    >
                      <td className="p-4">
                        <p className="text-theme font-semibold">{app.full_name}</p>
                        <p className="text-muted-theme text-xs">{app.email}</p>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Bus size={13} style={{ color: 'var(--primary)' }} />
                          <div>
                            <p className="text-theme font-medium">{app.plate_number}</p>
                            <p className="text-muted-theme text-xs">
                              {app.vehicle_model} - {app.seating_capacity} seats
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-muted-theme text-xs whitespace-nowrap">
                        {new Date(app.created_at).toLocaleDateString('en-PH', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="p-4 text-center">
                        <span className="step-badge text-xs">{docCount}/3</span>
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className="px-2.5 py-1 rounded-full text-xs font-bold"
                          style={{ background: st.bg, color: st.color }}
                        >
                          {app.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => {
                            setSelected(app);
                            setAdminNotes(app.admin_notes || '');
                          }}
                          className="btn-primary shadow-none text-xs py-1.5 px-4"
                        >
                          <Eye size={12} /> Review
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filter === 'All' && filtered.length > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-muted-theme">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}-
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
              style={{
                background: 'var(--tg-bg-alt)',
                border: '1px solid var(--tg-border)',
                color: 'var(--tg-text)',
                opacity: currentPage === 1 ? 0.55 : 1,
              }}
            >
              Previous
            </button>
            <span className="text-xs text-muted-theme">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
              style={{
                background: 'var(--primary)',
                color: 'white',
                opacity: currentPage === totalPages ? 0.55 : 1,
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selected &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
            onClick={() => {
              setSelected(null);
              setPreviewUrl(null);
            }}
          >
            <div
              className="card-glow rounded-2xl p-6 md:p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
              style={{ background: 'var(--tg-bg)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="icon-badge">
                    <Eye size={16} />
                  </div>
                  <div>
                    <h2 className="text-theme font-bold text-lg">Application Review</h2>
                    <p className="text-muted-theme text-xs">{selected.full_name}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelected(null);
                    setPreviewUrl(null);
                  }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition hover:scale-110 cursor-pointer"
                  style={{ background: 'var(--tg-subtle)', color: 'var(--tg-muted)' }}
                >
                  <X size={14} />
                </button>
              </div>

              {(() => {
                const st = STATUS_STYLES[selected.status] || STATUS_STYLES.pending;
                return (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold mb-6"
                    style={{ background: st.bg, color: st.color }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: 'currentColor' }} />
                    {selected.status}
                  </span>
                );
              })()}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6 mt-4">
                {[
                  { label: 'Full Name', value: selected.full_name },
                  { label: 'Email', value: selected.email },
                  { label: 'Contact', value: selected.contact_number },
                  { label: 'Address', value: selected.address },
                  { label: 'Plate Number', value: selected.plate_number },
                  { label: 'Vehicle', value: selected.vehicle_model },
                  { label: 'Capacity', value: `${selected.seating_capacity} seats` },
                  { label: 'Applied', value: new Date(selected.created_at).toLocaleString('en-PH') },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl"
                    style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}
                  >
                    <p className="text-[10px] text-muted-theme font-semibold uppercase tracking-wider">
                      {item.label}
                    </p>
                    <p className="text-theme text-sm font-medium truncate">{item.value}</p>
                  </div>
                ))}
              </div>

              <h3 className="text-theme font-bold text-sm mb-3">Uploaded Documents</h3>
              <div className="space-y-2 mb-6">
                {[
                  { label: "Driver's License", url: selected.drivers_license_url },
                  { label: 'Vehicle Registration (OR/CR)', url: selected.vehicle_registration_url },
                  { label: 'Franchise Certificate', url: selected.franchise_cert_url },
                ].map((doc) => (
                  <div
                    key={doc.label}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs"
                      style={{
                        background: doc.url ? 'rgba(34,197,94,0.1)' : 'var(--tg-subtle)',
                        color: doc.url ? '#22c55e' : 'var(--tg-muted)',
                      }}
                    >
                      <FileText size={14} />
                    </div>
                    <span className="text-sm text-theme flex-1">{doc.label}</span>
                    {doc.url ? (
                      <button
                        onClick={() => {
                          setPreviewUrl(doc.url);
                          setPreviewLabel(doc.label);
                        }}
                        className="btn-primary shadow-none text-xs py-1 px-3 cursor-pointer"
                      >
                        <Eye size={10} /> View
                      </button>
                    ) : (
                      <span
                        className="text-xs font-medium px-2.5 py-1 rounded-full"
                        style={{ background: 'var(--tg-subtle)', color: 'var(--tg-muted)' }}
                      >
                        Not uploaded
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {previewUrl && (
                <div className="mb-6 rounded-xl overflow-hidden" style={{ border: '1px solid var(--tg-border)' }}>
                  <div
                    className="flex items-center justify-between px-4 py-2.5"
                    style={{ background: 'var(--tg-bg-alt)', borderBottom: '1px solid var(--tg-border)' }}
                  >
                    <span className="text-sm font-semibold text-theme">{previewLabel}</span>
                    <button
                      onClick={() => setPreviewUrl(null)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:scale-110 cursor-pointer"
                      style={{ background: 'var(--tg-subtle)', color: 'var(--tg-muted)' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {previewUrl.match(/\.pdf/i) ? (
                    <iframe
                      src={previewUrl}
                      className="w-full"
                      style={{ height: '400px', border: 'none', background: '#fff' }}
                    />
                  ) : (
                    <div className="flex items-center justify-center p-4" style={{ background: 'var(--tg-bg-alt)' }}>
                      <Image
                        src={previewUrl}
                        alt={previewLabel}
                        width={960}
                        height={540}
                        className="max-w-full max-h-[400px] rounded-lg object-contain"
                        sizes="(max-width: 768px) 90vw, 800px"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="mb-6">
                <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                  Admin Notes
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Optional notes..."
                  rows={3}
                  className="input-dark w-full resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleStatusUpdate(selected.id, 'approved')}
                  disabled={updating}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition hover:scale-[1.02] cursor-pointer"
                  style={{
                    background: 'rgba(34,197,94,0.12)',
                    color: '#22c55e',
                    border: '1px solid rgba(34,197,94,0.3)',
                  }}
                >
                  {updating ? '...' : (
                    <>
                      <UserCheck size={16} /> Approve
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleStatusUpdate(selected.id, 'rejected')}
                  disabled={updating}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition hover:scale-[1.02] cursor-pointer"
                  style={{
                    background: 'rgba(239,68,68,0.12)',
                    color: '#ef4444',
                    border: '1px solid rgba(239,68,68,0.3)',
                  }}
                >
                  {updating ? '...' : (
                    <>
                      <UserX size={16} /> Reject
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
