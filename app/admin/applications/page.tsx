'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase/client';
import { FaUser, FaEnvelope, FaPhone, FaMapMarkerAlt, FaShuttleVan, FaIdCard, FaFileAlt, FaCheck, FaTimes, FaEye, FaClock, FaCheckCircle, FaTimesCircle, FaExternalLinkAlt, FaChair, FaSignOutAlt, FaShieldAlt, FaClipboardList, FaUserCheck, FaUserTimes } from 'react-icons/fa';

const isAbortLikeError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; message?: string };
  const name = (e.name || '').toLowerCase();
  const message = (e.message || '').toLowerCase();
  return name.includes('abort') || message.includes('aborted');
};

interface Application {
  id: string;
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

const STATUS_CONFIG: Record<string, { bg: string; color: string; icon: React.ReactNode; label: string }> = {
  pending:  { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', icon: <FaClock />, label: 'Pending' },
  approved: { bg: 'rgba(34,197,94,0.12)',  color: '#22c55e', icon: <FaCheckCircle />, label: 'Approved' },
  rejected: { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444', icon: <FaTimesCircle />, label: 'Rejected' },
};

const AdminApplicationsPage = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Application | null>(null);
  const [filter, setFilter] = useState('all');
  const [adminNotes, setAdminNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  // Check if user is admin
  useEffect(() => {
    let cancelled = false;

    const checkAdmin = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session) {
          window.location.replace('/login');
          return;
        }

        let userRow:
          | { role: string; email: string; full_name: string | null }
          | undefined;

        const { data: byId } = await supabase
          .from('tbl_users')
          .select('role, email, full_name')
          .eq('user_id', session.user.id)
          .limit(1);
        if (cancelled) return;
        userRow = byId?.[0];

        if (!userRow && session.user.email) {
          const normalizedEmail = session.user.email.trim().toLowerCase();
          const { data: byEmail } = await supabase
            .from('tbl_users')
            .select('role, email, full_name')
            .ilike('email', normalizedEmail)
            .limit(1);
          if (cancelled) return;
          userRow = byEmail?.[0];
        }

        const role = userRow?.role?.trim()?.toLowerCase();

        if (role === 'admin') {
          setIsAdmin(true);
          setAdminEmail(userRow?.email || session.user.email || '');
          setAdminName(userRow?.full_name || session.user.user_metadata?.full_name || 'Admin');
          setAuthChecking(false);
        } else {
          window.location.replace('/login');
        }
      } catch (error) {
        if (cancelled || isAbortLikeError(error)) return;
        setAuthChecking(false);
      }
    };
    checkAdmin();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.replace('/login');
  };

  const fetchApplications = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tbl_operator_applications')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setApplications(data);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) fetchApplications(); }, [isAdmin]);

  const handleStatusUpdate = async (id: string, status: string) => {
    setUpdating(true);
    const { error } = await supabase
      .from('tbl_operator_applications')
      .update({ status, admin_notes: adminNotes || null })
      .eq('id', id);
    if (!error) {
      await fetchApplications();
      setSelected(null);
      setAdminNotes('');
    }
    setUpdating(false);
  };

  const filtered = filter === 'all'
    ? applications
    : applications.filter((a) => a.status === filter);

  const counts = {
    all: applications.length,
    pending: applications.filter(a => a.status === 'pending').length,
    approved: applications.filter(a => a.status === 'approved').length,
    rejected: applications.filter(a => a.status === 'rejected').length,
  };

  // Loading spinner
  if (authChecking) {
    return (
      <main>
        <section className="relative pt-36 pb-28 px-6">
          <div className="flex justify-center py-20">
            <svg className="animate-spin h-8 w-8" style={{ color: 'var(--primary)' }} viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      {/* Hero */}
      <section className="relative pt-36 pb-16 px-6">
        <div className="max-w-6xl mx-auto" data-aos="fade-up">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="section-badge mb-5">
                <FaShieldAlt className="inline mr-1.5" size={11} /> Admin Dashboard
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold text-theme leading-tight">
                Operator <span className="text-gradient" style={{ fontStyle: 'italic' }}>Applications</span>
              </h1>
              <p className="mt-3 text-muted-theme text-lg">
                Welcome back, <span className="font-semibold text-theme">{adminName}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-theme text-sm font-semibold">{adminName}</p>
                <p className="text-muted-theme text-xs">{adminEmail}</p>
              </div>
              <button onClick={handleSignOut}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-105 cursor-pointer"
                style={{ background: 'var(--tg-subtle)', border: '1px solid var(--tg-border-primary)', color: 'var(--tg-muted)' }}>
                <FaSignOutAlt size={13} /> Sign out
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="px-6 pb-10">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-aos="fade-up" data-aos-delay="100">
            {[
              { label: 'Total', count: counts.all, icon: <FaClipboardList />, color: 'var(--primary)' },
              { label: 'Pending', count: counts.pending, icon: <FaClock />, color: '#f59e0b' },
              { label: 'Approved', count: counts.approved, icon: <FaUserCheck />, color: '#22c55e' },
              { label: 'Rejected', count: counts.rejected, icon: <FaUserTimes />, color: '#ef4444' },
            ].map((stat) => (
              <div key={stat.label} className="card-glow p-5 rounded-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm"
                    style={{ background: `${stat.color}18`, color: stat.color }}>
                    {stat.icon}
                  </div>
                  <span className="text-muted-theme text-xs font-semibold uppercase tracking-wider">{stat.label}</span>
                </div>
                <p className="text-3xl font-extrabold text-theme">{stat.count}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Applications Table */}
      <section className="px-6 pb-28">
        <div className="max-w-6xl mx-auto" data-aos="fade-up" data-aos-delay="200">
          <div className="card-glow p-6 md:p-8 rounded-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="icon-badge"><FaFileAlt /></div>
                <div>
                  <h2 className="text-theme font-bold text-xl">All Applications</h2>
                  <p className="text-muted-theme text-sm">Review and manage operator registrations</p>
                </div>
              </div>

              {/* Filter pills */}
              <div className="flex flex-wrap gap-2">
                {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => {
                  const active = filter === f;
                  return (
                    <button key={f} onClick={() => setFilter(f)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${active ? 'btn-primary shadow-none py-1.5 px-3.5' : ''}`}
                      style={!active ? { background: 'var(--tg-subtle)', border: '1px solid var(--tg-border-primary)', color: 'var(--primary)' } : {}}>
                      {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex justify-center py-16">
                <svg className="animate-spin h-8 w-8" style={{ color: 'var(--primary)' }} viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="icon-badge w-16 h-16 text-2xl opacity-40"><FaFileAlt /></div>
                <p className="text-muted-theme text-sm font-medium">No {filter === 'all' ? '' : filter} applications found</p>
                <p className="text-muted-theme text-xs">Operator registrations will appear here</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--tg-border)' }}>
                      <th className="text-left py-3 px-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Applicant</th>
                      <th className="text-left py-3 px-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Vehicle</th>
                      <th className="text-left py-3 px-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Date</th>
                      <th className="text-center py-3 px-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Docs</th>
                      <th className="text-center py-3 px-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Status</th>
                      <th className="text-center py-3 px-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((app) => {
                      const st = STATUS_CONFIG[app.status] || STATUS_CONFIG.pending;
                      const docCount = [app.drivers_license_url, app.vehicle_registration_url, app.franchise_cert_url].filter(Boolean).length;
                      return (
                        <tr key={app.id} style={{ borderBottom: '1px solid var(--tg-border)' }} className="hover:bg-[var(--tg-subtle)] transition-colors">
                          <td className="py-4 px-4">
                            <p className="text-theme font-semibold">{app.full_name}</p>
                            <p className="text-muted-theme text-xs mt-0.5">{app.email}</p>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <FaShuttleVan style={{ color: 'var(--primary)' }} size={13} />
                              <div>
                                <p className="text-theme font-medium">{app.plate_number}</p>
                                <p className="text-muted-theme text-xs">{app.vehicle_model} • {app.seating_capacity} seats</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-muted-theme text-xs whitespace-nowrap">
                            {new Date(app.created_at).toLocaleDateString('en-PH', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })}
                          </td>
                          <td className="py-4 px-4 text-center">
                            <span className="step-badge text-xs">{docCount}/3</span>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                              style={{ background: st.bg, color: st.color }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
                              {st.label}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <button onClick={() => { setSelected(app); setAdminNotes(app.admin_notes || ''); }}
                              className="btn-primary shadow-none text-xs py-1.5 px-4 group">
                              <FaEye size={11} /> Review
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Review Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
          <div className="card-glow rounded-2xl p-6 md:p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--tg-bg)' }}>

            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="icon-badge"><FaEye /></div>
                <div>
                  <h2 className="text-theme font-bold text-lg">Application Review</h2>
                  <p className="text-muted-theme text-xs">{selected.full_name}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-110"
                style={{ background: 'var(--tg-subtle)', color: 'var(--tg-muted)' }}>
                <FaTimes size={14} />
              </button>
            </div>

            {/* Current Status */}
            {(() => {
              const st = STATUS_CONFIG[selected.status] || STATUS_CONFIG.pending;
              return (
                <div className="mb-6 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold"
                  style={{ background: st.bg, color: st.color }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: 'currentColor' }} />
                  {st.label}
                </div>
              );
            })()}

            {/* Applicant Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              {[
                { icon: <FaUser />, label: 'Full Name', value: selected.full_name },
                { icon: <FaEnvelope />, label: 'Email', value: selected.email },
                { icon: <FaPhone />, label: 'Contact', value: selected.contact_number },
                { icon: <FaMapMarkerAlt />, label: 'Address', value: selected.address },
                { icon: <FaIdCard />, label: 'Plate Number', value: selected.plate_number },
                { icon: <FaShuttleVan />, label: 'Vehicle', value: selected.vehicle_model },
                { icon: <FaChair />, label: 'Capacity', value: `${selected.seating_capacity} seats` },
                { icon: <FaClock />, label: 'Applied', value: new Date(selected.created_at).toLocaleString('en-PH') },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs"
                    style={{ background: 'var(--tg-subtle)', color: 'var(--primary)' }}>
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-theme font-semibold uppercase tracking-wider">{item.label}</p>
                    <p className="text-theme text-sm font-medium truncate">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Uploaded Documents */}
            <h3 className="text-theme font-bold text-sm mb-3 flex items-center gap-2">
              <FaFileAlt style={{ color: 'var(--primary)' }} /> Uploaded Documents
            </h3>
            <div className="space-y-2 mb-6">
              {[
                { label: "Driver's License", url: selected.drivers_license_url },
                { label: 'Vehicle Registration (OR/CR)', url: selected.vehicle_registration_url },
                { label: 'Franchise Certificate', url: selected.franchise_cert_url },
              ].map((doc) => (
                <div key={doc.label} className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs"
                    style={{ background: doc.url ? 'rgba(34,197,94,0.1)' : 'var(--tg-subtle)', color: doc.url ? '#22c55e' : 'var(--tg-muted)' }}>
                    <FaFileAlt />
                  </div>
                  <span className="text-sm text-theme flex-1">{doc.label}</span>
                  {doc.url ? (
                    <a href={doc.url} target="_blank" rel="noopener noreferrer"
                      className="btn-primary shadow-none text-xs py-1 px-3">
                      <FaExternalLinkAlt size={10} /> View
                    </a>
                  ) : (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full"
                      style={{ background: 'var(--tg-subtle)', color: 'var(--tg-muted)' }}>
                      Not uploaded
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Admin Notes */}
            <div className="mb-6">
              <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">Admin Notes</label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Optional notes about this application..."
                rows={3}
                className="input-dark w-full resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => handleStatusUpdate(selected.id, 'approved')}
                disabled={updating}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] cursor-pointer"
                style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                {updating ? '...' : <><FaCheck /> Approve</>}
              </button>
              <button
                onClick={() => handleStatusUpdate(selected.id, 'rejected')}
                disabled={updating}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] cursor-pointer"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                {updating ? '...' : <><FaTimes /> Reject</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default AdminApplicationsPage;
