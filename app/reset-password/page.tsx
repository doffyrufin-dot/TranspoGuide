'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase/client';
import { FaArrowRight, FaLock } from 'react-icons/fa';

export default function ResetPasswordPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    const prepareSession = async () => {
      let sessionReady = false;

      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : '';

      if (hash.includes('access_token=')) {
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!error) {
            sessionReady = true;
            if (!cancelled) {
              window.history.replaceState(null, '', window.location.pathname);
            }
          }
        }
      }

      if (!sessionReady) {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const tokenHash = url.searchParams.get('token_hash');
        const type = url.searchParams.get('type');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) {
            sessionReady = true;
            if (!cancelled) {
              window.history.replaceState(null, '', window.location.pathname);
            }
          }
        } else if (tokenHash && type === 'recovery') {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });
          if (!error) {
            sessionReady = true;
            if (!cancelled) {
              window.history.replaceState(null, '', window.location.pathname);
            }
          }
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;
      if (!session) {
        setErrorMsg(
          'Invalid or expired reset link. Please request a new one and make sure reset URL is allowed in Supabase Auth settings.'
        );
      }
      setLoading(false);
    };

    prepareSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMsg(error.message);
      setSaving(false);
      return;
    }

    await supabase.auth.signOut();
    setSuccessMsg(
      'Password updated successfully. Please log in using your new password.'
    );
    setTimeout(() => {
      window.location.replace('/login');
    }, 1200);
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
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
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-20">
      <div className="w-full max-w-md">
        <div className="card-glow p-8 md:p-10 rounded-2xl">
          <div className="mb-8">
            <div className="icon-badge mb-4" style={{ background: 'rgba(37,151,233,0.14)' }}>
              <FaLock size={15} />
            </div>
            <h1 className="text-2xl font-bold text-theme">Reset Password</h1>
            <p className="text-muted-theme text-sm mt-1">
              Set your new password for your account.
            </p>
          </div>

          {errorMsg && (
            <div
              className="mb-4 text-sm rounded-lg px-3 py-2"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div
              className="mb-4 text-sm rounded-lg px-3 py-2"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}
            >
              {successMsg}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="input-dark"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="input-dark"
                required
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="btn-primary w-full text-base group mt-2"
            >
              {saving ? 'Updating...' : 'Update Password'}
              {!saving && (
                <FaArrowRight
                  size={13}
                  className="group-hover:translate-x-1 transition-transform"
                />
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
