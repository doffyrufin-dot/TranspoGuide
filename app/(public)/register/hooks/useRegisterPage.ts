'use client';

import { useEffect, useState } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import sileoToast from '@/lib/utils/sileo-toast';
import { supabase } from '@/utils/supabase/client';

export type AuthMethod = 'choose' | 'email' | 'verify-email';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatar: string;
};

export type RegisterEmailForm = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type RegisterOperatorForm = {
  full_name: string;
  email: string;
  contact_number: string;
  address: string;
  plate_number: string;
  vehicle_model: string;
  seating_capacity: string;
};

export type RegisterOperatorFiles = {
  drivers_license: File | null;
  vehicle_registration: File | null;
  franchise_cert: File | null;
};

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const toValidBaseUrl = (value: string) => {
  try {
    return normalizeBaseUrl(new URL(value).toString());
  } catch {
    return '';
  }
};

const isLocalHostname = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

const isLocalUrl = (value: string) => {
  try {
    return isLocalHostname(new URL(value).hostname);
  } catch {
    return false;
  }
};

const getAppBaseUrl = () => {
  const envUrlRaw = (process.env.NEXT_PUBLIC_APP_URL || '').trim();
  const envUrl = envUrlRaw ? toValidBaseUrl(envUrlRaw) : '';

  if (typeof window !== 'undefined') {
    const browserOrigin = normalizeBaseUrl(window.location.origin);
    if (!envUrl) return browserOrigin;
    if (isLocalUrl(envUrl) && !isLocalUrl(browserOrigin)) return browserOrigin;
    return envUrl;
  }

  return envUrl;
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

export function useRegisterPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessCheckLoading, setAccessCheckLoading] = useState(false);
  const [authMethod, setAuthMethod] = useState<AuthMethod>('choose');

  const [emailForm, setEmailForm] = useState<RegisterEmailForm>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');

  const [form, setForm] = useState<RegisterOperatorForm>({
    full_name: '',
    email: '',
    contact_number: '+63',
    address: '',
    plate_number: '',
    vehicle_model: 'Van',
    seating_capacity: '',
  });
  const [files, setFiles] = useState<RegisterOperatorFiles>({
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
          description: error.message || 'Please login and continue registration.',
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
              // Ignore local cleanup errors.
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

    void getUser();

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
      }
    );

    return () => subscription.unsubscribe();
  }, []);

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

  const handleEmailFieldChange = (
    field: keyof RegisterEmailForm,
    value: string
  ) => {
    setEmailForm((prev) => ({ ...prev, [field]: value }));
  };

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword((prev) => !prev);
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
        description: 'Email confirmation is currently disabled in auth settings.',
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
        vehicle_model: 'Van',
        seating_capacity: '',
      });
    } catch (err: any) {
      sileoToast.error({
        title: 'Sign out failed',
        description: err?.message || 'Failed to sign out.',
      });
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    if (name === 'contact_number') {
      setForm((prev) => ({ ...prev, contact_number: normalizePhMobile(value) }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, key: string) => {
    setFiles((prev) => ({ ...prev, [key]: e.target.files?.[0] || null }));
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

      if (files.drivers_license) {
        urls.drivers_license_url = await uploadFile(
          files.drivers_license,
          'licenses'
        );
      }
      if (files.vehicle_registration) {
        urls.vehicle_registration_url = await uploadFile(
          files.vehicle_registration,
          'registrations'
        );
      }
      if (files.franchise_cert) {
        urls.franchise_cert_url = await uploadFile(
          files.franchise_cert,
          'franchises'
        );
      }

      const { error } = await supabase.from('tbl_operator_applications').insert({
        user_id: user.id,
        full_name: form.full_name,
        email: form.email,
        contact_number: normalizedContact,
        address: form.address,
        plate_number: form.plate_number,
        vehicle_model: form.vehicle_model,
        seating_capacity: parseInt(form.seating_capacity, 10) || 0,
        ...urls,
        status: 'pending',
      });
      if (error) throw error;

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
          supabase.from('tbl_users').select('role').eq('user_id', user.id).limit(1),
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
        }
      } catch {
        // Keep user on register page if status lookup fails.
      } finally {
        if (!cancelled) setAccessCheckLoading(false);
      }
    };

    void syncApprovedAccess();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  return {
    user,
    authLoading,
    accessCheckLoading,
    authMethod,
    setAuthMethod,
    emailForm,
    showPassword,
    showConfirmPassword,
    emailLoading,
    resendLoading,
    verifyEmail,
    form,
    files,
    submitting,
    errorMsg,
    showApprovalPopup,
    isFormValid,
    handleGoogleSignIn,
    handleEmailSignUp,
    handleResendVerification,
    handleSignOut,
    handleChange,
    handleFile,
    handleSubmit,
    handleEmailFieldChange,
    togglePasswordVisibility,
    toggleConfirmPasswordVisibility,
  };
}

