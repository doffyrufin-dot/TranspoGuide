'use client';

import { useEffect } from 'react';
import sileoToast from '@/lib/utils/sileo-toast';

export default function AuthHashToast() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;

    const params = new URLSearchParams(hash.replace('#', ''));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (accessToken && refreshToken) {
      const targetPath = type === 'recovery' ? '/reset-password' : '/register';
      if (window.location.pathname !== targetPath) {
        window.location.replace(`${targetPath}${window.location.hash}`);
        return;
      }
    }

    if (!hash.includes('error=')) return;

    const errorCode = params.get('error_code') || '';
    const errorDesc =
      params.get('error_description') || 'An authentication error occurred.';

    let message = decodeURIComponent(errorDesc).replace(/\+/g, ' ');
    if (errorCode === 'otp_expired') {
      message =
        'Your email verification link has expired. Please register again to get a new link.';
    } else if (errorCode === 'access_denied') {
      message = 'Access denied. The link may have already been used.';
    }

    window.history.replaceState(null, '', window.location.pathname);

    setTimeout(
      () =>
        sileoToast.error(
          {
            title: 'Authentication error',
            description: message,
          },
          { duration: 6000 }
        ),
      300
    );
  }, []);

  return null;
}
