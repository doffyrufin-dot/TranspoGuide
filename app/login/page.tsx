'use client';
import React, { useEffect, useRef, useState } from 'react';
import {
  supabase,
  SUPABASE_CONFIGURED,
  SUPABASE_INIT_ERROR,
} from '@/utils/supabase/client';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { resolveUserRedirect } from '@/lib/services/auth.services';
import sileoToast from '@/lib/utils/sileo-toast';
import {
  FaGoogle,
  FaRoute,
  FaShieldAlt,
  FaStar,
  FaArrowRight,
  FaClock,
  FaSignOutAlt,
} from 'react-icons/fa';

const getAppBaseUrl = () => {
  const envUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
};

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const [signingMethod, setSigningMethod] = useState<'email' | 'google' | null>(
    null
  );
  const [resetLoading, setResetLoading] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<'pending' | 'rejected'>(
    'pending'
  );
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingName, setPendingName] = useState('');
  const navigatingRef = useRef(false);
  const forgotEmailRef = useRef<HTMLInputElement | null>(null);

  const completeAuthCheck = () => {
    setAuthLoading(false);
  };

  const safeNavigate = (path: string) => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    setAuthLoading(false);
    window.location.replace(path);
  };

  const getStatusFromQuery = (): 'pending' | 'rejected' | null => {
    const status = new URLSearchParams(window.location.search).get('status');
    if (status === 'pending' || status === 'rejected') return status;
    return null;
  };

  const isForceLogin = () =>
    new URLSearchParams(window.location.search).get('force') === '1';

  const redirectToRegisterWithNotice = (description: string) => {
    sileoToast.warning({
      title: 'Complete your information',
      description: (
        <>
          {description}
          <br />
          Redirecting in 3 seconds...
        </>
      ),
    });
    completeAuthCheck();
    window.setTimeout(() => {
      safeNavigate('/register');
    }, 3000);
  };

  const redirectByRole = async (
    userId: string,
    userEmail?: string,
    userName?: string
  ) => {
    try {
      const result = await resolveUserRedirect(userId, userEmail);
      if (result.type === 'redirect') {
        safeNavigate(result.path);
        return;
      }
      if (result.type === 'pending') {
        setPendingStatus(result.status);
        setPendingEmail(result.email);
        setPendingName(userName || '');
        setPendingApproval(true);
        completeAuthCheck();
        return;
      }
      if (result.type === 'needs_profile') {
        redirectToRegisterWithNotice('Your profile details are incomplete.');
        return;
      }
      if (result.type === 'none') {
        redirectToRegisterWithNotice(
          'This account is not fully registered yet.'
        );
        return;
      }
      completeAuthCheck();
    } catch (error) {
      completeAuthCheck();
    }
  };

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) {
      completeAuthCheck();
      return;
    }

    let cancelled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled && !navigatingRef.current) {
        completeAuthCheck();
      }
    }, 2500);

    const bootstrapAuth = async () => {
      try {
        const forceLogin = isForceLogin();
        // Fallback for implicit OAuth callback (#access_token in URL hash)
        const hash = window.location.hash.startsWith('#')
          ? window.location.hash.slice(1)
          : '';
        if (hash.includes('access_token=')) {
          const params = new URLSearchParams(hash);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (!cancelled) {
              window.history.replaceState(null, '', window.location.pathname);
            }
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled || navigatingRef.current) return;

        if (forceLogin) {
          if (session) {
            await supabase.auth.signOut();
          }
          if (!cancelled) {
            window.history.replaceState(null, '', '/login');
          }
          completeAuthCheck();
          return;
        }

        if (!session) {
          const statusFromQuery = getStatusFromQuery();
          if (statusFromQuery) {
            setPendingStatus(statusFromQuery);
            setPendingEmail('');
            setPendingName('');
            setPendingApproval(true);
          }
          completeAuthCheck();
          return;
        }
        window.history.replaceState(null, '', window.location.pathname);
        const meta = session.user.user_metadata;
        await redirectByRole(
          session.user.id,
          session.user.email,
          meta?.full_name || meta?.name
        );
      } catch (error) {
        if (cancelled) return;
        completeAuthCheck();
      }
    };

    bootstrapAuth();

    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const {
        data: { subscription: sub },
      } = supabase.auth.onAuthStateChange(
        async (_event: AuthChangeEvent, session: Session | null) => {
          try {
            if (cancelled || navigatingRef.current) return;
            if (isForceLogin()) {
              completeAuthCheck();
              return;
            }
            if (!session) {
              completeAuthCheck();
              return;
            }
            window.history.replaceState(null, '', window.location.pathname);
            const meta = session.user.user_metadata;
            await redirectByRole(
              session.user.id,
              session.user.email,
              meta?.full_name || meta?.name
            );
          } catch (error) {
            if (cancelled) return;
            completeAuthCheck();
          }
        }
      );
      subscription = sub;
    } catch {
      completeAuthCheck();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      subscription?.unsubscribe();
    };
  }, []);

  // ? Google Login
  const handleGoogleLogin = async () => {
    if (!SUPABASE_CONFIGURED) {
      sileoToast.error({
        title: 'Missing configuration',
        description:
          SUPABASE_INIT_ERROR ||
          'Supabase environment variables are not available in this deployment.',
      });
      return;
    }
    setLoading(true);
    setSigningMethod('google');
    const appBaseUrl = getAppBaseUrl();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Go directly back to /login so the browser client can exchange the
        // OAuth session and reuse the same redirect-by-role logic.
        redirectTo: `${appBaseUrl}/login`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      sileoToast.error({
        title: 'Google sign in failed',
        description: error.message,
      });
      setLoading(false);
      setSigningMethod(null);
    }
  };

  // ? Email Login
  const handleEmailLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    if (!SUPABASE_CONFIGURED) {
      sileoToast.error({
        title: 'Missing configuration',
        description:
          SUPABASE_INIT_ERROR ||
          'Supabase environment variables are not available in this deployment.',
      });
      return;
    }
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    setLoading(true);
    setSigningMethod('email');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        const lowerMsg = (error.message || '').toLowerCase();
        const isInvalidCredentials =
          lowerMsg.includes('invalid login credentials') ||
          lowerMsg.includes('invalid credentials');
        sileoToast.error({
          title: 'Login failed',
          description: isInvalidCredentials
            ? 'Invalid credentials. If this account was created with Google, use Google login or click Forgot to set an email password.'
            : error.message,
        });
        return;
      }
      if (data.session) {
        await redirectByRole(data.session.user.id, email);
      }
    } finally {
      if (!navigatingRef.current) {
        setLoading(false);
        setSigningMethod(null);
      }
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setPendingApproval(false);
    setLoading(false);
  };

  const handleForgotPassword = async (rawEmail?: string) => {
    const email = (rawEmail ?? emailInput).trim();
    if (!email) {
      sileoToast.error({
        title: 'Email required',
        description: 'Please enter your email address first.',
      });
      return;
    }

    setResetLoading(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        sileoToast.error({
          title: 'Reset failed',
          description:
            data?.reason ||
            data?.error ||
            'Unable to send reset email. Please try again in a few minutes.',
        });
      } else {
        sileoToast.success({
          title: 'Reset link sent',
          description: 'Password reset link sent. Please check your email.',
        });
        setForgotModalOpen(false);
      }
    } catch (error: any) {
      sileoToast.error({
        title: 'Reset failed',
        description: error?.message || 'Unable to send reset email.',
      });
    }
    setResetLoading(false);
  };

  useEffect(() => {
    if (!forgotModalOpen) return;
    const timer = window.setTimeout(() => {
      forgotEmailRef.current?.focus();
      forgotEmailRef.current?.select();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [forgotModalOpen]);

  if (authLoading) {
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

  if (!SUPABASE_CONFIGURED) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="card-glow rounded-2xl p-8 text-center max-w-xl w-full">
          <h1 className="text-2xl font-bold text-theme mb-2">
            Missing Supabase Configuration
          </h1>
          <p className="text-muted-theme text-sm">
            This deployment is missing or has invalid{' '}
            <code>NEXT_PUBLIC_SUPABASE_URL</code> and/or{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
          </p>
          {SUPABASE_INIT_ERROR && (
            <p className="text-red-400 text-sm mt-2">{SUPABASE_INIT_ERROR}</p>
          )}
          <p className="text-muted-theme text-sm mt-2">
            Add the env vars in Vercel for Production, then redeploy.
          </p>
        </div>
      </main>
    );
  }

  if (pendingApproval) {
    const isRejected = pendingStatus === 'rejected';

    return (
      <main className="min-h-screen flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-md text-center">
          <div className="card-glow p-8 md:p-10 rounded-2xl flex flex-col items-center gap-5">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-3xl animate-pulse"
              style={
                isRejected
                  ? { background: 'rgba(239,68,68,0.12)', color: '#ef4444' }
                  : { background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }
              }
            >
              <FaClock />
            </div>
            <h1 className="text-2xl font-bold text-theme">
              {isRejected ? 'Application Rejected' : 'Waiting for Approval'}
            </h1>
            <p className="text-muted-theme text-sm leading-relaxed max-w-sm">
              {isRejected
                ? 'Your operator application was rejected by admin. Please update your details and documents, then submit again.'
                : 'Your operator registration is currently under review. An admin will review your application and documents. You will be able to access the dashboard once approved.'}
            </p>
            {pendingEmail && (
              <p className="text-xs text-muted-theme">
                Account:{' '}
                <span className="font-semibold text-theme">{pendingEmail}</span>
              </p>
            )}
            <div
              className="w-full mt-2 p-3 rounded-xl text-sm font-semibold text-center"
              style={
                isRejected
                  ? {
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      color: '#ef4444',
                    }
                  : {
                      background: 'rgba(245,158,11,0.08)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      color: '#f59e0b',
                    }
              }
            >
              Status: {isRejected ? 'Rejected' : 'Pending Review'}
            </div>
            <p className="text-[11px] text-muted-theme">
              If no email notification is received, this page shows your latest
              official application status.
            </p>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-105 cursor-pointer mt-2"
              style={{
                background: 'var(--tg-subtle)',
                border: '1px solid var(--tg-border)',
                color: 'var(--tg-muted)',
              }}
            >
              <FaSignOutAlt size={13} /> Sign out & go back
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex">
      {/* Left branding panel */}
      <div
        className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 relative overflow-hidden p-12"
        style={{
          background: 'linear-gradient(160deg, var(--primary-dark), #0a1a3a)',
        }}
      >
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,.4) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div
          className="absolute top-0 right-0 bottom-0 w-[1px]"
          style={{ background: 'var(--tg-border)' }}
        />
        <div className="relative">
          <div className="flex items-center gap-2.5 mb-16">
            <div
              className="icon-badge"
              style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
            >
              <FaRoute size={16} />
            </div>
            <span className="text-xl font-bold text-white">
              Transpo
              <span style={{ color: 'var(--primary-light)' }}>Guide</span>
            </span>
          </div>
          <h2 className="text-3xl font-extrabold text-white leading-tight mb-4">
            Welcome to the
            <br />
            <span
              style={{ color: 'var(--primary-light)', fontStyle: 'italic' }}
            >
              Operator Portal
            </span>
          </h2>
          <p className="text-white/60 text-sm leading-relaxed mb-8">
            Manage routes, fares, and seat availability for your fleet.
          </p>
          <div className="space-y-4">
            {[
              { icon: <FaRoute />, text: 'Manage routes & schedules' },
              { icon: <FaShieldAlt />, text: 'Secure operator access' },
              { icon: <FaStar />, text: 'Real-time seat management' },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 text-white/60 text-sm"
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: 'var(--primary-light)',
                  }}
                >
                  {item.icon}
                </div>
                {item.text}
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-white/30 text-xs">
          © {new Date().getFullYear()} TranspoGuide
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-md">
          <div className="lg:hidden text-center mb-8">
            <span className="text-2xl font-bold text-theme">
              Transpo<span className="text-gradient">Guide</span>
            </span>
          </div>
          <div className="card-glow p-8 md:p-10 rounded-2xl">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-theme">Welcome back</h1>
              <p className="text-muted-theme text-sm mt-1">
                Sign in to your operator account
              </p>
            </div>
            <form className="space-y-5" onSubmit={handleEmailLogin}>
              <div>
                <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="operator@transpoguide.com"
                  className="input-dark"
                  disabled={loading}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                  Password
                </label>
                <input
                  type="password"
                  name="password"
                  placeholder="••••••••"
                  className="input-dark"
                  disabled={loading}
                  required
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded accent-[var(--primary)] cursor-pointer"
                    disabled={loading}
                  />
                  <span className="text-muted-theme group-hover:text-theme transition-colors">
                    Remember me
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(emailInput);
                    setForgotModalOpen(true);
                  }}
                  disabled={loading || resetLoading}
                  className="text-muted-theme hover:text-[var(--primary)] cursor-pointer transition-colors font-medium"
                >
                  {resetLoading ? 'Sending...' : 'Forgot?'}
                </button>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full text-base group mt-2"
              >
                {loading && signingMethod === 'email' ? (
                  <span className="inline-flex items-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
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
                    Signing in...
                  </span>
                ) : (
                  <>
                    Sign In{' '}
                    <FaArrowRight
                      size={13}
                      className="group-hover:translate-x-1 transition-transform"
                    />
                  </>
                )}
              </button>
            </form>
            <div className="my-6 flex items-center gap-4">
              <div className="divider flex-1" />
              <span className="text-muted-theme text-xs">OR</span>
              <div className="divider flex-1" />
            </div>
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-[var(--radius-btn)] text-theme text-sm font-medium transition-all cursor-pointer btn-outline"
            >
              <FaGoogle className="text-red-500" />{' '}
              {loading && signingMethod === 'google'
                ? 'Redirecting...'
                : 'Continue with Google'}
            </button>
            <p className="mt-6 text-center text-sm text-muted-theme">
              New operator?{' '}
              <a
                href="/register"
                onClick={(e) => {
                  if (loading) e.preventDefault();
                }}
                className="font-semibold hover:underline"
                style={{ color: 'var(--primary)' }}
              >
                Register here
              </a>
            </p>
          </div>
        </div>
      </div>

      {forgotModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center px-4"
          style={{ background: 'rgba(2,6,23,0.72)' }}
          onClick={() => {
            if (!resetLoading) setForgotModalOpen(false);
          }}
        >
          <form
            className="w-full max-w-md card-glow p-6 md:p-7 rounded-2xl"
            onSubmit={(e) => {
              e.preventDefault();
              if (!resetLoading) {
                void handleForgotPassword(forgotEmail);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-theme mb-1">
              Reset password
            </h3>
            <p className="text-muted-theme text-sm mb-5">
              Enter your account email to receive a reset link.
            </p>
            <div>
              <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                type="email"
                ref={forgotEmailRef}
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="operator@transpoguide.com"
                className="input-dark"
                disabled={resetLoading}
              />
            </div>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setForgotModalOpen(false)}
                disabled={resetLoading}
                className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer"
                style={{
                  background: 'var(--tg-subtle)',
                  border: '1px solid var(--tg-border)',
                  color: 'var(--tg-muted)',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetLoading}
                className="btn-primary text-sm"
                style={
                  resetLoading ? { opacity: 0.65, cursor: 'not-allowed' } : {}
                }
              >
                {resetLoading ? 'Sending...' : 'Send reset link'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
};

export default LoginPage;
