'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase/client';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import sileoToast from '@/lib/utils/sileo-toast';
import {
  FaUser,
  FaEnvelope,
  FaPhone,
  FaMapMarkerAlt,
  FaShuttleVan,
  FaIdCard,
  FaFileAlt,
  FaCloudUploadAlt,
  FaArrowRight,
  FaCheckCircle,
  FaTimesCircle,
  FaGoogle,
  FaSignOutAlt,
  FaLock,
  FaClock,
  FaEye,
  FaEyeSlash,
} from 'react-icons/fa';

type AuthMethod = 'choose' | 'email' | 'verify-email';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar: string;
}

const getAppBaseUrl = () => {
  const envUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
};

const hasStrongPassword = (value: string) => {
  if (value.length < 8) return false;
  return (
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
};

const normalizePhMobile = (value: string) => {
  const digits = value.replace(/\D/g, '');

  let local = '';
  if (digits.startsWith('63')) {
    local = digits.slice(2);
  } else if (digits.startsWith('0')) {
    local = digits.slice(1);
  } else {
    local = digits;
  }

  if (local.startsWith('9')) {
    local = local.slice(0, 10);
  } else if (local.length > 0) {
    local = `9${local.slice(0, 9)}`;
  }

  return `+63${local}`;
};

const isValidPhMobile = (value: string) => /^\+639\d{9}$/.test(value.trim());

const RegisterPage = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessCheckLoading, setAccessCheckLoading] = useState(false);
  const [authMethod, setAuthMethod] = useState<AuthMethod>('choose');

  // Email/password sign-up state
  const [emailForm, setEmailForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState(''); // email waiting for verification

  // Application form state
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    contact_number: '+63',
    address: '',
    plate_number: '',
    vehicle_model: '',
    seating_capacity: '',
  });
  const [files, setFiles] = useState<{ [key: string]: File | null }>({
    drivers_license: null,
    vehicle_registration: null,
    franchise_cert: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showApprovalPopup, setShowApprovalPopup] = useState(false);

  useEffect(() => {
    const consumeSignupHashSession = async () => {
      if (typeof window === 'undefined') return;
      const rawHash = window.location.hash?.replace(/^#/, '').trim();
      if (!rawHash) return;

      const hashParams = new URLSearchParams(rawHash);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const flowType = hashParams.get('type');
      const hashError = hashParams.get('error');

      if (hashError) {
        const description =
          hashParams.get('error_description') ||
          'Email link is invalid or expired.';
        sileoToast.error({
          title: 'Verification link issue',
          description,
        });
        window.history.replaceState({}, '', '/register');
        return;
      }

      if (!accessToken || !refreshToken) return;

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      window.history.replaceState({}, '', '/register');

      if (error) {
        sileoToast.error({
          title: 'Session setup failed',
          description:
            error.message || 'Please login and continue registration.',
        });
        return;
      }

      if (flowType === 'signup') {
        sileoToast.success({
          title: 'Email confirmed',
          description: 'Continue by completing your operator information.',
        });
      }
    };

    void consumeSignupHashSession();
  }, []);

  // Check for existing session
  useEffect(() => {
    const getUser = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (error) {
          const msg = (error.message || '').toLowerCase();
          const isInvalidRefreshToken =
            msg.includes('invalid refresh token') ||
            msg.includes('refresh token not found');
          if (isInvalidRefreshToken) {
            await supabase.auth.signOut({ scope: 'local' }).catch(() => {
              // ignore local cleanup errors
            });
            setUser(null);
            return;
          }
          throw error;
        }

        if (session?.user) {
          const u = session.user;
          const authUser: AuthUser = {
            id: u.id,
            email: u.email || '',
            name: u.user_metadata?.full_name || u.user_metadata?.name || '',
            avatar: u.user_metadata?.avatar_url || '',
          };
          setUser(authUser);
          setForm((prev) => ({
            ...prev,
            full_name: prev.full_name || authUser.name,
            email: prev.email || authUser.email,
          }));
        }
      } catch (err: any) {
        sileoToast.error({
          title: 'Session error',
          description: err?.message || 'Failed to load session.',
        });
      } finally {
        setAuthLoading(false);
      }
    };
    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
      if (session?.user) {
        const u = session.user;
        const authUser: AuthUser = {
          id: u.id,
          email: u.email || '',
          name: u.user_metadata?.full_name || u.user_metadata?.name || '',
          avatar: u.user_metadata?.avatar_url || '',
        };
        setUser(authUser);
        setForm((prev) => ({
          ...prev,
          full_name: prev.full_name || authUser.name,
          email: prev.email || authUser.email,
        }));
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- Auth Handlers ---
  const handleGoogleSignIn = async () => {
    try {
      const appBaseUrl = getAppBaseUrl();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${appBaseUrl}/auth/callback?debug=1&flow=register`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      sileoToast.error({
        title: 'Google sign-in failed',
        description: err?.message || 'Please try again later.',
      });
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const appBaseUrl = getAppBaseUrl();
    const normalizedEmail = emailForm.email.trim().toLowerCase();

    if (!normalizedEmail) {
      sileoToast.error({
        title: 'Email required',
        description: 'Please enter your email address.',
      });
      return;
    }

    if (emailForm.password !== emailForm.confirmPassword) {
      sileoToast.error({
        title: 'Password mismatch',
        description: 'Passwords do not match.',
      });
      return;
    }
    if (!hasStrongPassword(emailForm.password)) {
      sileoToast.error({
        title: 'Weak password',
        description:
          'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.',
      });
      return;
    }
    setEmailLoading(true);
    const loadingToast = sileoToast.loading({
      title: 'Sending verification email',
    });
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: emailForm.password,
      options: {
        data: { full_name: emailForm.name },
        emailRedirectTo: `${appBaseUrl}/auth/callback?flow=register`,
      },
    });
    sileoToast.dismiss(loadingToast);
    setEmailLoading(false);
    if (error) {
      const lowerMsg = (error.message || '').toLowerCase();
      if (lowerMsg.includes('email rate limit exceeded')) {
        sileoToast.warning({
          title: 'Too many requests',
          description: 'Please wait a few minutes before trying again.',
        });
        return;
      }
      sileoToast.error({
        title: 'Sign-up failed',
        description: error.message,
      });
      return;
    }

    if (data.session) {
      sileoToast.info({
        title: 'Account created',
        description:
          'Email confirmation is currently disabled in auth settings.',
      });
      return;
    }

    if (data.user) {
      const hasNoIdentity =
        Array.isArray((data.user as any).identities) &&
        (data.user as any).identities.length === 0;

      if (hasNoIdentity) {
        sileoToast.warning({
          title: 'Account already exists',
          description:
            'This email is already registered. Please log in or use Forgot Password.',
        });
        return;
      }

      sileoToast.success({
        title: 'Verification email sent',
        description: 'Check your inbox or spam folder.',
      });
      setVerifyEmail(normalizedEmail);
      setAuthMethod('verify-email');
      return;
    }

    sileoToast.warning({
      title: 'Unable to confirm email status',
      description: 'Please try again or resend confirmation email.',
    });
  };

  const handleResendVerification = async () => {
    const appBaseUrl = getAppBaseUrl();
    const targetEmail = verifyEmail || emailForm.email.trim().toLowerCase();
    if (!targetEmail) return;

    setResendLoading(true);
    const loadingToast = sileoToast.loading({
      title: 'Resending confirmation email',
    });

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: targetEmail,
      options: {
        emailRedirectTo: `${appBaseUrl}/auth/callback?flow=register`,
      },
    });

    sileoToast.dismiss(loadingToast);
    setResendLoading(false);

    if (error) {
      const lowerMsg = (error.message || '').toLowerCase();
      if (lowerMsg.includes('email rate limit exceeded')) {
        sileoToast.warning({
          title: 'Too many requests',
          description: 'Please wait a few minutes before resending.',
        });
        return;
      }
      sileoToast.error({
        title: 'Resend failed',
        description: error.message || 'Please try again later.',
      });
      return;
    }

    sileoToast.success({
      title: 'Email sent',
      description: 'A new confirmation email was sent.',
    });
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setAuthMethod('choose');
      setEmailForm({ name: '', email: '', password: '', confirmPassword: '' });
      setForm({
        full_name: '',
        email: '',
        contact_number: '+63',
        address: '',
        plate_number: '',
        vehicle_model: '',
        seating_capacity: '',
      });
    } catch (err: any) {
      sileoToast.error({
        title: 'Sign out failed',
        description: err?.message || 'Failed to sign out.',
      });
    }
  };

  // --- Application Form Handlers ---
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'contact_number') {
      setForm({ ...form, contact_number: normalizePhMobile(value) });
      return;
    }
    setForm({ ...form, [name]: value });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, key: string) => {
    setFiles({ ...files, [key]: e.target.files?.[0] || null });
  };

  const uploadFile = async (file: File, folder: string) => {
    const ext = file.name.split('.').pop();
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error } = await supabase.storage
      .from('operator-documents')
      .upload(fileName, file);
    if (error) throw error;
    const { data: urlData } = supabase.storage
      .from('operator-documents')
      .getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      sileoToast.error({
        title: 'Sign in required',
        description: 'Please sign in first before submitting application.',
      });
      return;
    }
    if (!isValidPhMobile(form.contact_number)) {
      sileoToast.error({
        title: 'Invalid contact number',
        description: 'Use PH mobile format: +639123456789.',
      });
      return;
    }

    const normalizedContact = normalizePhMobile(form.contact_number);

    setSubmitting(true);
    setErrorMsg('');
    const loadingToast = sileoToast.loading({
      title: 'Submitting your application',
    });
    try {
      const urls: Record<string, string | null> = {
        drivers_license_url: null,
        vehicle_registration_url: null,
        franchise_cert_url: null,
      };
      if (files.drivers_license)
        urls.drivers_license_url = await uploadFile(
          files.drivers_license,
          'licenses'
        );
      if (files.vehicle_registration)
        urls.vehicle_registration_url = await uploadFile(
          files.vehicle_registration,
          'registrations'
        );
      if (files.franchise_cert)
        urls.franchise_cert_url = await uploadFile(
          files.franchise_cert,
          'franchises'
        );

      const { error } = await supabase
        .from('tbl_operator_applications')
        .insert({
          user_id: user?.id || null,
          full_name: form.full_name,
          email: form.email,
          contact_number: normalizedContact,
          address: form.address,
          plate_number: form.plate_number,
          vehicle_model: form.vehicle_model,
          seating_capacity: parseInt(form.seating_capacity) || 0,
          ...urls,
          status: 'pending',
        });
      if (error) throw error;

      if (user) {
        const { error: upsertError } = await supabase.from('tbl_users').upsert(
          {
            user_id: user.id,
            email: user.email,
            full_name: form.full_name,
            avatar_url: user.avatar,
            role: 'operator',
          },
          { onConflict: 'user_id' }
        );
        if (upsertError) throw upsertError;
      }
      sileoToast.dismiss(loadingToast);
      sileoToast.success({
        title: 'Application submitted',
        description: 'An admin will review your application.',
      });
      setShowApprovalPopup(true);
    } catch (err: any) {
      sileoToast.dismiss(loadingToast);
      const msg = err.message || 'Failed to submit application';
      setErrorMsg(msg);
      sileoToast.error({
        title: 'Submission failed',
        description: msg,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid =
    form.full_name.trim() &&
    form.email.trim() &&
    isValidPhMobile(form.contact_number) &&
    form.address.trim() &&
    form.plate_number.trim() &&
    form.vehicle_model.trim() &&
    form.seating_capacity.trim();

  useEffect(() => {
    if (authLoading || !user?.id) return;

    let cancelled = false;

    const syncApprovedAccess = async () => {
      setAccessCheckLoading(true);
      try {
        const [{ data: userRows }, { data: appRows }] = await Promise.all([
          supabase
            .from('tbl_users')
            .select('role')
            .eq('user_id', user.id)
            .limit(1),
          supabase
            .from('tbl_operator_applications')
            .select('status')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1),
        ]);

        if (cancelled) return;

        const role = (userRows?.[0]?.role || '').toString().toLowerCase();
        const latestStatus = (appRows?.[0]?.status || '')
          .toString()
          .toLowerCase();

        if (role === 'admin') {
          window.location.replace('/admin');
          return;
        }

        if (role === 'operator' && latestStatus === 'approved') {
          window.location.replace('/operator');
          return;
        }
      } catch {
        // keep user on register page if status lookup fails
      } finally {
        if (!cancelled) setAccessCheckLoading(false);
      }
    };

    void syncApprovedAccess();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  // --- Render States ---

  if (authLoading || accessCheckLoading) {
    return (
      <main>
        <section className="relative pt-36 pb-28 px-6">
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
        </section>
      </main>
    );
  }

  if (showApprovalPopup) {
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
              Your operator application was submitted successfully. An admin
              will review your details and documents before dashboard access is
              enabled.
            </p>
            {form.email && (
              <p className="text-xs text-muted-theme">
                Account:{' '}
                <span className="font-semibold text-theme">{form.email}</span>
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
            <button
              onClick={() => window.location.replace('/login')}
              className="btn-primary w-full text-sm"
            >
              Go To Login
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (authMethod === 'verify-email') {
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
              <h1 className="text-2xl font-bold text-theme">
                Check Your Email
              </h1>
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
                onClick={handleResendVerification}
                disabled={resendLoading}
                className="btn-primary w-full text-sm"
                style={
                  resendLoading ? { opacity: 0.65, cursor: 'not-allowed' } : {}
                }
              >
                {resendLoading ? 'Resending...' : 'Resend confirmation email'}
              </button>
              <button
                onClick={() => setAuthMethod('email')}
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

  //  NOT SIGNED IN Show auth method chooser or email form
  if (!user) {
    return (
      <main>
        <section className="relative pt-36 pb-16 px-6">
          <div className="max-w-lg mx-auto text-center">
            <div className="section-badge mx-auto mb-5">
              Operator Registration
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-theme leading-tight">
              Register as a{' '}
              <span className="text-gradient" style={{ fontStyle: 'italic' }}>
                Van Operator
              </span>
            </h1>
            <p className="mt-4 text-muted-theme text-base max-w-xl mx-auto mb-10">
              Create an account to submit your operator application. Choose how
              you&apos;d like to sign up.
            </p>
          </div>
        </section>

        <section className="px-6 pb-28">
          <div className="max-w-md mx-auto">
            {authMethod === 'choose' && (
              <div className="card-glow p-8 rounded-2xl flex flex-col gap-4">
                <h2 className="text-theme font-bold text-lg text-center mb-2">
                  Choose Sign-up Method
                </h2>

                {/* Google */}
                <button
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-xl text-theme font-medium transition-all hover:scale-[1.02] cursor-pointer"
                  style={{
                    background: 'var(--tg-bg-alt)',
                    border: '1px solid var(--tg-border)',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: 'rgba(234,67,53,0.1)',
                      color: '#ea4335',
                    }}
                  >
                    <FaGoogle size={18} />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-theme text-sm">
                      Continue with Google
                    </p>
                    <p className="text-muted-theme text-xs">
                      Your name & email will be auto-filled
                    </p>
                  </div>
                  <FaArrowRight
                    size={13}
                    className="ml-auto text-muted-theme"
                  />
                </button>

                <div className="flex items-center gap-3 my-1">
                  <div
                    className="flex-1 h-px"
                    style={{ background: 'var(--tg-border)' }}
                  />
                  <span className="text-muted-theme text-xs">OR</span>
                  <div
                    className="flex-1 h-px"
                    style={{ background: 'var(--tg-border)' }}
                  />
                </div>

                {/* Email */}
                <button
                  onClick={() => setAuthMethod('email')}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-xl text-theme font-medium transition-all hover:scale-[1.02] cursor-pointer"
                  style={{
                    background: 'var(--tg-bg-alt)',
                    border: '1px solid var(--tg-border)',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: 'var(--tg-subtle)',
                      color: 'var(--primary)',
                    }}
                  >
                    <FaEnvelope size={16} />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-theme text-sm">
                      Sign up with Email
                    </p>
                    <p className="text-muted-theme text-xs">
                      You&apos;ll receive a verification email
                    </p>
                  </div>
                  <FaArrowRight
                    size={13}
                    className="ml-auto text-muted-theme"
                  />
                </button>

                <p className="text-center text-xs text-muted-theme mt-2">
                  Already have an account?{' '}
                  <a
                    href="/login"
                    className="font-semibold hover:underline"
                    style={{ color: 'var(--primary)' }}
                  >
                    Sign in
                  </a>
                </p>
              </div>
            )}

            {authMethod === 'email' && (
              <div className="card-glow p-8 rounded-2xl">
                <button
                  onClick={() => setAuthMethod('choose')}
                  className="text-xs text-muted-theme hover:text-theme transition-colors mb-5 flex items-center gap-1.5 cursor-pointer"
                >
                  Back to options
                </button>
                <h2 className="text-theme font-bold text-xl mb-1">
                  Create your account
                </h2>
                <p className="text-muted-theme text-sm mb-6">
                  A confirmation email will be sent to verify your address.
                </p>

                <form className="space-y-4" onSubmit={handleEmailSignUp}>
                  <div>
                    <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                      Full Name
                    </label>
                    <div className="relative">
                      <FaUser
                        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        size={13}
                        style={{ color: 'var(--tg-muted)' }}
                      />
                      <input
                        type="text"
                        required
                        value={emailForm.name}
                        onChange={(e) =>
                          setEmailForm({ ...emailForm, name: e.target.value })
                        }
                        placeholder="e.g. Juan Dela Cruz"
                        className="input-dark w-full"
                        style={{ paddingLeft: '2.25rem' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <FaEnvelope
                        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        size={13}
                        style={{ color: 'var(--tg-muted)' }}
                      />
                      <input
                        type="email"
                        required
                        value={emailForm.email}
                        onChange={(e) =>
                          setEmailForm({ ...emailForm, email: e.target.value })
                        }
                        placeholder="juan@email.com"
                        className="input-dark w-full"
                        style={{ paddingLeft: '2.25rem' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <FaLock
                        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        size={13}
                        style={{ color: 'var(--tg-muted)' }}
                      />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}"
                        title="At least 8 characters, with uppercase, lowercase, number, and symbol."
                        value={emailForm.password}
                        onChange={(e) =>
                          setEmailForm({
                            ...emailForm,
                            password: e.target.value,
                          })
                        }
                        placeholder="Min. 8 characters"
                        className="input-dark w-full"
                        style={{
                          paddingLeft: '2.25rem',
                          paddingRight: '2.5rem',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 transition cursor-pointer"
                        style={{ color: 'var(--tg-muted)' }}
                      >
                        {showPassword ? (
                          <FaEyeSlash size={14} />
                        ) : (
                          <FaEye size={14} />
                        )}
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-theme">
                      Must include uppercase, lowercase, number, symbol, and at
                      least 8 characters.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <FaLock
                        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        size={13}
                        style={{ color: 'var(--tg-muted)' }}
                      />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={emailForm.confirmPassword}
                        onChange={(e) =>
                          setEmailForm({
                            ...emailForm,
                            confirmPassword: e.target.value,
                          })
                        }
                        placeholder="Re-enter your password"
                        className="input-dark w-full"
                        style={{
                          paddingLeft: '2.25rem',
                          paddingRight: '2.5rem',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword((prev) => !prev)
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 transition cursor-pointer"
                        style={{ color: 'var(--tg-muted)' }}
                        aria-label={
                          showConfirmPassword
                            ? 'Hide confirm password'
                            : 'Show confirm password'
                        }
                      >
                        {showConfirmPassword ? (
                          <FaEyeSlash size={14} />
                        ) : (
                          <FaEye size={14} />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="btn-primary w-full text-base group mt-2"
                  >
                    {emailLoading ? (
                      <svg
                        className="animate-spin h-4 w-4"
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
                    ) : (
                      <>
                        Send Verification Email{' '}
                        <FaArrowRight
                          size={13}
                          className="group-hover:translate-x-1 transition-transform"
                        />
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>
        </section>
      </main>
    );
  }

  // SIGNED IN show registration form
  return (
    <main>
      {/* Hero */}
      <section className="relative pt-36 pb-16 px-6">
        <div className="max-w-3xl mx-auto text-center" data-aos="fade-up">
          <div className="section-badge mx-auto mb-5">
            Operator Registration
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-theme leading-tight">
            Register as a{' '}
            <span className="text-gradient" style={{ fontStyle: 'italic' }}>
              Van Operator
            </span>
          </h1>
          <p className="mt-4 text-muted-theme text-lg max-w-xl mx-auto">
            Fill in your details and upload the required documents. An admin
            will review your application.
          </p>
        </div>
      </section>

      {/* Registration Form */}
      <section className="pb-28 px-6">
        <div className="max-w-3xl mx-auto">
          {/* Signed-in banner */}
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
              onClick={handleSignOut}
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

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Personal Information */}
            <div
              className="card-glow p-6 md:p-8 rounded-2xl"
              data-aos="fade-up"
            >
              <h2 className="text-theme font-bold text-xl mb-1 flex items-center gap-2">
                <FaUser style={{ color: 'var(--primary)' }} /> Personal
                Information
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
                    onChange={handleChange}
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
                    onChange={handleChange}
                    placeholder="e.g. juan@email.com"
                    className="input-dark"
                    readOnly={!!user.email}
                    style={
                      user.email ? { opacity: 0.7, cursor: 'not-allowed' } : {}
                    }
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
                    onChange={handleChange}
                    placeholder="+639123456789"
                    pattern="^\+639\d{9}$"
                    title="Use PH mobile format: +639123456789"
                    maxLength={13}
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
                    onChange={handleChange}
                    placeholder="e.g. Brgy. Libertad, Isabel, Leyte"
                    className="input-dark"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Vehicle Information */}
            <div
              className="card-glow p-6 md:p-8 rounded-2xl"
              data-aos="fade-up"
            >
              <h2 className="text-theme font-bold text-xl mb-1 flex items-center gap-2">
                <FaShuttleVan style={{ color: 'var(--primary)' }} /> Vehicle
                Information
              </h2>
              <p className="text-muted-theme text-sm mb-6">
                Details about your van
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                    Plate Number
                  </label>
                  <input
                    type="text"
                    name="plate_number"
                    value={form.plate_number}
                    onChange={handleChange}
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
                    onChange={handleChange}
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
                    onChange={handleChange}
                    placeholder="e.g. 14"
                    className="input-dark"
                    min="1"
                    max="30"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Document Uploads */}
            <div
              className="card-glow p-6 md:p-8 rounded-2xl"
              data-aos="fade-up"
            >
              <h2 className="text-theme font-bold text-xl mb-1 flex items-center gap-2">
                <FaFileAlt style={{ color: 'var(--primary)' }} /> Required
                Documents
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
                ].map((doc) => (
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
                        <p className="text-theme font-semibold text-sm">
                          {doc.label}
                        </p>
                        <p className="text-muted-theme text-xs mt-0.5">
                          {doc.desc}
                        </p>
                        <label
                          className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all hover:scale-[1.02]"
                          style={{
                            background: 'var(--tg-subtle)',
                            border: '1px solid var(--tg-border-primary)',
                            color: 'var(--primary)',
                          }}
                        >
                          <FaCloudUploadAlt size={14} />
                          {(files as any)[doc.key]
                            ? (files as any)[doc.key].name
                            : 'Choose File'}
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="hidden"
                            onChange={(e) => handleFile(e, doc.key)}
                          />
                        </label>
                      </div>
                      {(files as any)[doc.key] && (
                        <span
                          className="text-xs font-semibold flex items-center gap-1"
                          style={{ color: '#22c55e' }}
                        >
                          <FaCheckCircle size={11} /> Attached
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Error message */}
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

            {/* Submit */}
            <button
              type="submit"
              disabled={!isFormValid || submitting}
              className="btn-primary w-full text-base group"
              style={
                !isFormValid || submitting
                  ? { opacity: 0.5, cursor: 'not-allowed' }
                  : {}
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
                  Submitting
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
};

export default RegisterPage;
