'use client';

import React from 'react';
import {
  FaArrowRight,
  FaEnvelope,
  FaEye,
  FaEyeSlash,
  FaGoogle,
  FaLock,
  FaUser,
} from 'react-icons/fa';

type AuthMethod = 'choose' | 'email' | 'verify-email';

type EmailFormState = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

type RegisterAuthSectionProps = {
  authMethod: AuthMethod;
  emailForm: EmailFormState;
  showPassword: boolean;
  showConfirmPassword: boolean;
  emailLoading: boolean;
  onSetAuthMethod: (method: AuthMethod) => void;
  onGoogleSignIn: () => void;
  onEmailSignUp: (e: React.FormEvent) => void;
  onEmailFieldChange: (field: keyof EmailFormState, value: string) => void;
  onTogglePasswordVisibility: () => void;
  onToggleConfirmPasswordVisibility: () => void;
};

export default function RegisterAuthSection({
  authMethod,
  emailForm,
  showPassword,
  showConfirmPassword,
  emailLoading,
  onSetAuthMethod,
  onGoogleSignIn,
  onEmailSignUp,
  onEmailFieldChange,
  onTogglePasswordVisibility,
  onToggleConfirmPasswordVisibility,
}: RegisterAuthSectionProps) {
  return (
    <main>
      <section className="relative pt-36 pb-16 px-6">
        <div className="max-w-lg mx-auto text-center">
          <div className="section-badge mx-auto mb-5">Operator Registration</div>
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

              <button
                onClick={onGoogleSignIn}
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
                <FaArrowRight size={13} className="ml-auto text-muted-theme" />
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

              <button
                onClick={() => onSetAuthMethod('email')}
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
                <FaArrowRight size={13} className="ml-auto text-muted-theme" />
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
                onClick={() => onSetAuthMethod('choose')}
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

              <form className="space-y-4" onSubmit={onEmailSignUp}>
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
                      onChange={(e) => onEmailFieldChange('name', e.target.value)}
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
                      onChange={(e) => onEmailFieldChange('email', e.target.value)}
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
                        onEmailFieldChange('password', e.target.value)
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
                      onClick={onTogglePasswordVisibility}
                      className="absolute right-3 top-1/2 -translate-y-1/2 transition cursor-pointer"
                      style={{ color: 'var(--tg-muted)' }}
                    >
                      {showPassword ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
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
                        onEmailFieldChange('confirmPassword', e.target.value)
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
                      onClick={onToggleConfirmPasswordVisibility}
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
