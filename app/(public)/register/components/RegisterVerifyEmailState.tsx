'use client';

import React from 'react';
import { FaEnvelope } from 'react-icons/fa';

type RegisterVerifyEmailStateProps = {
  verifyEmail: string;
  onUseDifferentEmail: () => void;
};

export default function RegisterVerifyEmailState({
  verifyEmail,
  onUseDifferentEmail,
}: RegisterVerifyEmailStateProps) {
  return (
    <main>
      <section className="relative pt-36 pb-28 px-6">
        <div className="max-w-lg mx-auto text-center">
          <div className="card-glow p-10 rounded-2xl flex flex-col items-center gap-5">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-3xl animate-pulse"
              style={{
                background: 'rgba(37,151,233,0.12)',
                color: 'var(--primary)',
              }}
            >
              <FaEnvelope />
            </div>
            <h1 className="text-2xl font-bold text-theme">Check Your Email</h1>
            <p className="text-muted-theme text-sm leading-relaxed max-w-sm">
              We sent a confirmation link to{' '}
              <span className="font-semibold text-theme">{verifyEmail}</span>.
              Click the link in that email to verify your account, then come
              back here to continue.
            </p>
            <div
              className="w-full p-3 rounded-xl text-sm font-medium text-center"
              style={{
                background: 'rgba(37,151,233,0.08)',
                border: '1px solid rgba(37,151,233,0.2)',
                color: 'var(--primary)',
              }}
            >
              Didn&apos;t get it? Check your spam folder.
            </div>

            <button
              onClick={onUseDifferentEmail}
              className="text-sm text-muted-theme hover:text-theme transition-colors underline cursor-pointer"
            >
              Use a different email
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
