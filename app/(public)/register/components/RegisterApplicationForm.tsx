'use client';

import React from 'react';
import type { AuthUser, OperatorFileInput } from '@/lib/services/register.services';
import {
  FaArrowRight,
  FaCheckCircle,
  FaCloudUploadAlt,
  FaFileAlt,
  FaShuttleVan,
  FaSignOutAlt,
  FaTimesCircle,
  FaUser,
} from 'react-icons/fa';

type OperatorFormState = {
  full_name: string;
  email: string;
  contact_number: string;
  address: string;
  plate_number: string;
  vehicle_model: string;
  seating_capacity: string;
};

type RegisterApplicationFormProps = {
  user: AuthUser;
  form: OperatorFormState;
  files: OperatorFileInput;
  errorMsg: string;
  submitting: boolean;
  isFormValid: boolean;
  onSignOut: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onFieldChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>, key: string) => void;
};

export default function RegisterApplicationForm({
  user,
  form,
  files,
  errorMsg,
  submitting,
  isFormValid,
  onSignOut,
  onSubmit,
  onFieldChange,
  onFileChange,
}: RegisterApplicationFormProps) {
  return (
    <main>
      <section className="relative pt-36 pb-16 px-6">
        <div className="max-w-3xl mx-auto text-center" data-aos="fade-up">
          <div className="section-badge mx-auto mb-5">Operator Registration</div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-theme leading-tight">
            Register as a{' '}
            <span className="text-gradient" style={{ fontStyle: 'italic' }}>
              Van Operator
            </span>
          </h1>
          <p className="mt-4 text-muted-theme text-lg max-w-xl mx-auto">
            Fill in your details and upload the required documents. An admin will
            review your application.
          </p>
        </div>
      </section>

      <section className="pb-28 px-6">
        <div className="max-w-3xl mx-auto">
          <div
            className="card-glow p-4 rounded-2xl mb-6 flex items-center gap-4"
            data-aos="fade-up"
          >
            {user.avatar && (
              <img
                src={user.avatar}
                alt=""
                className="w-10 h-10 rounded-full shrink-0"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-theme font-semibold text-sm truncate">
                {user.name || user.email}
              </p>
              <p className="text-muted-theme text-xs truncate">{user.email}</p>
            </div>
            <button
              onClick={onSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105 cursor-pointer"
              style={{
                background: 'var(--tg-subtle)',
                border: '1px solid var(--tg-border-primary)',
                color: 'var(--tg-muted)',
              }}
            >
              <FaSignOutAlt size={11} /> Sign out
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-6">
            <div className="card-glow p-6 md:p-8 rounded-2xl" data-aos="fade-up">
              <h2 className="text-theme font-bold text-xl mb-1 flex items-center gap-2">
                <FaUser style={{ color: 'var(--primary)' }} /> Personal Information
              </h2>
              <p className="text-muted-theme text-sm mb-6">
                Your personal details for verification
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    name="full_name"
                    value={form.full_name}
                    onChange={onFieldChange}
                    placeholder="e.g. Juan Dela Cruz"
                    className="input-dark"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={onFieldChange}
                    placeholder="e.g. juan@email.com"
                    className="input-dark"
                    readOnly={!!user.email}
                    style={user.email ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    name="contact_number"
                    value={form.contact_number}
                    onChange={onFieldChange}
                    placeholder="e.g. 09123456789"
                    className="input-dark"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                    Address
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={form.address}
                    onChange={onFieldChange}
                    placeholder="e.g. Brgy. Libertad, Isabel, Leyte"
                    className="input-dark"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="card-glow p-6 md:p-8 rounded-2xl" data-aos="fade-up">
              <h2 className="text-theme font-bold text-xl mb-1 flex items-center gap-2">
                <FaShuttleVan style={{ color: 'var(--primary)' }} /> Vehicle
                Information
              </h2>
              <p className="text-muted-theme text-sm mb-6">Details about your van</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                    Plate Number
                  </label>
                  <input
                    type="text"
                    name="plate_number"
                    value={form.plate_number}
                    onChange={onFieldChange}
                    placeholder="e.g. ABC-1234"
                    className="input-dark"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                    Vehicle Model
                  </label>
                  <input
                    type="text"
                    name="vehicle_model"
                    value={form.vehicle_model}
                    onChange={onFieldChange}
                    placeholder="e.g. Toyota HiAce"
                    className="input-dark"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                    Seating Capacity
                  </label>
                  <input
                    type="number"
                    name="seating_capacity"
                    value={form.seating_capacity}
                    onChange={onFieldChange}
                    placeholder="e.g. 14"
                    className="input-dark"
                    min="1"
                    max="30"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="card-glow p-6 md:p-8 rounded-2xl" data-aos="fade-up">
              <h2 className="text-theme font-bold text-xl mb-1 flex items-center gap-2">
                <FaFileAlt style={{ color: 'var(--primary)' }} /> Required Documents
              </h2>
              <p className="text-muted-theme text-sm mb-6">
                Upload scanned copies or clear photos of your documents
              </p>
              <div className="space-y-5">
                {[
                  {
                    key: 'drivers_license',
                    label: "Driver's License",
                    desc: "Professional driver's license (front & back)",
                  },
                  {
                    key: 'vehicle_registration',
                    label: 'Vehicle Registration (OR/CR)',
                    desc: 'Official Receipt & Certificate of Registration',
                  },
                  {
                    key: 'franchise_cert',
                    label: 'Franchise Certificate',
                    desc: 'LTFRB or local franchise certification',
                  },
                ].map((doc) => {
                  const file = files[doc.key as keyof OperatorFileInput];
                  return (
                  <div
                    key={doc.key}
                    className="p-4 rounded-xl"
                    style={{
                      background: 'var(--tg-bg-alt)',
                      border: '1px solid var(--tg-border)',
                    }}
                  >
                    <div className="flex items-start gap-4">
                      <div className="icon-badge w-10 h-10 text-sm shrink-0">
                        <FaFileAlt />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-theme font-semibold text-sm">{doc.label}</p>
                        <p className="text-muted-theme text-xs mt-0.5">{doc.desc}</p>
                        <label
                          className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all hover:scale-[1.02]"
                          style={{
                            background: 'var(--tg-subtle)',
                            border: '1px solid var(--tg-border-primary)',
                            color: 'var(--primary)',
                          }}
                        >
                          <FaCloudUploadAlt size={14} />
                          {file?.name || 'Choose File'}
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="hidden"
                            onChange={(e) => onFileChange(e, doc.key)}
                          />
                        </label>
                      </div>
                      {file && (
                        <span
                          className="text-xs font-semibold flex items-center gap-1"
                          style={{ color: '#22c55e' }}
                        >
                          <FaCheckCircle size={11} /> Attached
                        </span>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>

            {errorMsg && (
              <div
                className="p-4 rounded-xl flex items-center gap-3"
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                }}
              >
                <FaTimesCircle style={{ color: '#ef4444' }} />
                <p className="text-sm font-medium" style={{ color: '#ef4444' }}>
                  {errorMsg}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={!isFormValid || submitting}
              className="btn-primary w-full text-base group"
              style={
                !isFormValid || submitting ? { opacity: 0.5, cursor: 'not-allowed' } : {}
              }
            >
              {submitting ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
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
                  Submitting...
                </>
              ) : (
                <>
                  <FaFileAlt /> Submit Application
                  <FaArrowRight
                    size={14}
                    className="ml-auto group-hover:translate-x-1 transition-transform"
                  />
                </>
              )}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
