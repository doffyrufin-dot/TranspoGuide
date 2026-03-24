'use client';

import React from 'react';
import { FaClock } from 'react-icons/fa';

type RegisterApprovalStateProps = {
  email: string;
  onGoToLogin: () => void;
};

export default function RegisterApprovalState({
  email,
  onGoToLogin,
}: RegisterApprovalStateProps) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-20">
      <div className="w-full max-w-md text-center">
        <div className="card-glow p-8 md:p-10 rounded-2xl flex flex-col items-center gap-5">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl animate-pulse"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}
          >
            <FaClock />
          </div>
          <h1 className="text-2xl font-bold text-theme">
            Waiting for Approval
          </h1>
          <p className="text-muted-theme text-sm leading-relaxed max-w-sm">
            Your operator application was submitted successfully. An admin will
            review your details and documents before dashboard access is
            enabled.
          </p>
          {email && (
            <p className="text-xs text-muted-theme">
              Account: <span className="font-semibold text-theme">{email}</span>
            </p>
          )}
          <div
            className="w-full mt-2 p-3 rounded-xl text-sm font-semibold text-center"
            style={{
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.2)',
              color: '#f59e0b',
            }}
          >
            Status: Pending Review
          </div>
          <button onClick={onGoToLogin} className="btn-primary w-full text-sm">
            Go To Login
          </button>
        </div>
      </div>
    </main>
  );
}
