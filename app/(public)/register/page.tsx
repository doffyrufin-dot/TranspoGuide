'use client';

import React from 'react';
import RegisterApplicationForm from './components/RegisterApplicationForm';
import RegisterApprovalState from './components/RegisterApprovalState';
import RegisterAuthSection from './components/RegisterAuthSection';
import RegisterVerifyEmailState from './components/RegisterVerifyEmailState';
import { useRegisterPage } from './hooks/useRegisterPage';

const RegisterPage = () => {
  const {
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
  } = useRegisterPage();

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
      <RegisterApprovalState
        email={form.email}
        onGoToLogin={() => window.location.replace('/login')}
      />
    );
  }

  if (authMethod === 'verify-email') {
    return (
      <RegisterVerifyEmailState
        verifyEmail={verifyEmail}
        resendLoading={resendLoading}
        onResendVerification={handleResendVerification}
        onUseDifferentEmail={() => setAuthMethod('email')}
      />
    );
  }

  if (!user) {
    return (
      <RegisterAuthSection
        authMethod={authMethod}
        emailForm={emailForm}
        showPassword={showPassword}
        showConfirmPassword={showConfirmPassword}
        emailLoading={emailLoading}
        onSetAuthMethod={setAuthMethod}
        onGoogleSignIn={handleGoogleSignIn}
        onEmailSignUp={handleEmailSignUp}
        onEmailFieldChange={handleEmailFieldChange}
        onTogglePasswordVisibility={togglePasswordVisibility}
        onToggleConfirmPasswordVisibility={toggleConfirmPasswordVisibility}
      />
    );
  }

  return (
    <RegisterApplicationForm
      user={user}
      form={form}
      files={files}
      errorMsg={errorMsg}
      submitting={submitting}
      isFormValid={Boolean(isFormValid)}
      onSignOut={handleSignOut}
      onSubmit={handleSubmit}
      onFieldChange={handleChange}
      onFileChange={handleFile}
    />
  );
};

export default RegisterPage;

