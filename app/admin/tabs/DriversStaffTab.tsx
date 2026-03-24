'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bus, FileText, IdCard, Phone, X } from 'lucide-react';
import sileoToast from '@/lib/utils/sileo-toast';

type OperatorRow = {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  contact: string;
  address: string;
  plate_number: string;
  vehicle_model: string;
  seating_capacity: number;
  drivers_license_url: string | null;
  vehicle_registration_url: string | null;
  franchise_cert_url: string | null;
  admin_notes: string | null;
  status: string;
  approved_at: string | null;
};

export default function DriversStaffTab({ accessToken }: { accessToken: string }) {
  const [filterRole, setFilterRole] = useState('All');
  const [loading, setLoading] = useState(true);
  const [operators, setOperators] = useState<OperatorRow[]>([]);
  const [selectedOperator, setSelectedOperator] = useState<OperatorRow | null>(null);
  const [docPreview, setDocPreview] = useState<{ label: string; url: string } | null>(null);

  const loadOperators = async (silent = false) => {
    if (!accessToken) return;
    try {
      if (!silent) setLoading(true);
      const res = await fetch('/api/admin/operators', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load operators.');
      }
      setOperators((data.operators || []) as OperatorRow[]);
    } catch (err: any) {
      if (!silent) {
        sileoToast.error({
          title: 'Failed to load drivers',
          description: err?.message || 'Please try again.',
        });
      }
      setOperators([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadOperators(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const filtered = useMemo(() => {
    if (filterRole === 'All') return operators;
    return operators;
  }, [operators, filterRole]);

  return (
    <div className="admin-tab">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold text-theme">Drivers</h1>
          <p className="text-muted-theme text-sm">
            Approved van operators from applications
          </p>
        </div>
        <button
          onClick={() => void loadOperators(false)}
          className="btn-primary text-sm"
          disabled={loading}
        >
          Refresh Drivers
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        {['All', 'Driver'].map((r) => (
          <button
            key={r}
            onClick={() => setFilterRole(r)}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer
              ${filterRole === r ? 'text-white' : 'text-muted-theme'}`}
            style={
              filterRole === r
                ? { background: 'var(--primary)' }
                : { background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }
            }
          >
            {r === 'All' ? 'All' : 'Drivers'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted-theme">Loading drivers...</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-theme">No approved operators found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((staff) => (
            <button
              key={staff.id}
              type="button"
              onClick={() => setSelectedOperator(staff)}
              className="card-glow p-5 rounded-2xl flex flex-col gap-4 text-left cursor-pointer transition hover:scale-[1.01]"
            >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold"
                  style={{ background: 'var(--tg-subtle)', color: 'var(--primary)' }}
                >
                  {staff.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-theme text-sm">{staff.name}</h3>
                  <span
                    className="text-xs px-2 py-0.5 rounded-lg text-muted-theme"
                    style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}
                  >
                    Driver
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-theme">
                <IdCard size={13} /> <span className="font-mono text-xs">Operator ID: {staff.user_id || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-theme">
                <Phone size={13} /> <span>{staff.contact || staff.email || '-'}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-theme">
                <Bus size={13} />{' '}
                <span>
                  Assigned: <span className="text-theme font-medium">{staff.plate_number} ({staff.vehicle_model})</span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-theme">
                <FileText size={13} />
                <span>Tap card for full details</span>
              </div>
            </div>

            <div className="mt-auto pt-2">
              <div
                className="text-center py-2 rounded-xl text-xs font-bold uppercase tracking-wide"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}
              >
                Approved
              </div>
            </div>
            </button>
          ))}
        </div>
      )}

      {selectedOperator &&
        createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
          onClick={() => {
            setSelectedOperator(null);
            setDocPreview(null);
          }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--tg-card)', border: '1px solid var(--tg-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-xl font-bold text-theme">{selectedOperator.name}</h3>
                <p className="text-sm text-muted-theme">{selectedOperator.email || '-'}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedOperator(null);
                  setDocPreview(null);
                }}
                className="p-2 rounded-lg cursor-pointer"
                style={{ background: 'var(--tg-subtle)', color: 'var(--tg-muted)' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-xl" style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}>
                <p className="text-xs text-muted-theme uppercase mb-1">Contact</p>
                <p className="text-sm text-theme font-semibold">{selectedOperator.contact || '-'}</p>
              </div>
              <div className="p-3 rounded-xl" style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}>
                <p className="text-xs text-muted-theme uppercase mb-1">Vehicle</p>
                <p className="text-sm text-theme font-semibold">
                  {selectedOperator.plate_number} ({selectedOperator.vehicle_model}) - {selectedOperator.seating_capacity} seats
                </p>
              </div>
              <div className="p-3 rounded-xl md:col-span-2" style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}>
                <p className="text-xs text-muted-theme uppercase mb-1">Address</p>
                <p className="text-sm text-theme font-semibold">{selectedOperator.address || '-'}</p>
              </div>
              <div className="p-3 rounded-xl md:col-span-2" style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}>
                <p className="text-xs text-muted-theme uppercase mb-1">Admin Notes</p>
                <p className="text-sm text-theme font-semibold">{selectedOperator.admin_notes || 'No notes'}</p>
              </div>
            </div>

            <div>
              <h4 className="text-theme font-bold mb-2">Documents</h4>
              <div className="space-y-2">
                {[
                  { label: 'Driver License', url: selectedOperator.drivers_license_url },
                  { label: 'Vehicle Registration', url: selectedOperator.vehicle_registration_url },
                  { label: 'Franchise Certificate', url: selectedOperator.franchise_cert_url },
                ].map((doc) => (
                  <div
                    key={doc.label}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}
                  >
                    <p className="text-sm text-theme font-medium">{doc.label}</p>
                    {doc.url ? (
                      <button
                        type="button"
                        onClick={() => setDocPreview({ label: doc.label, url: doc.url! })}
                        className="text-xs font-semibold underline cursor-pointer"
                        style={{ color: 'var(--primary)' }}
                      >
                        View
                      </button>
                    ) : (
                      <span className="text-xs text-muted-theme">Not uploaded</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {docPreview &&
        createPortal(
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center p-4"
          style={{ background: 'transparent' }}
          onClick={() => setDocPreview(null)}
        >
          <div
            className="w-full max-w-4xl rounded-2xl p-4"
            style={{ background: 'var(--tg-card)', border: '1px solid var(--tg-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-theme font-bold">{docPreview.label}</h4>
              <button
                type="button"
                onClick={() => setDocPreview(null)}
                className="p-2 rounded-lg cursor-pointer"
                style={{ background: 'var(--tg-subtle)', color: 'var(--tg-muted)' }}
              >
                <X size={16} />
              </button>
            </div>
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--tg-border)', background: 'var(--tg-bg-alt)' }}
            >
              <iframe
                src={docPreview.url}
                title={docPreview.label}
                className="w-full"
                style={{ height: '75vh', border: 'none' }}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
