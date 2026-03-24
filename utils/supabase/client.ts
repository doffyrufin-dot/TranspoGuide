// utils/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const hasConfig = Boolean(supabaseUrl && supabaseAnonKey);

let supabaseInitError: string | null = null;

if (hasConfig) {
  try {
    // Validate URL early so invalid values do not crash the whole login page.
    new URL(supabaseUrl as string);
  } catch {
    supabaseInitError =
      'NEXT_PUBLIC_SUPABASE_URL is invalid. Expected a full URL like https://<project>.supabase.co';
  }
}

const missingEnvMessage = hasConfig
  ? (supabaseInitError ??
    'Supabase client failed to initialize. Please check your Supabase environment variables.')
  : 'Supabase client is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.';

const missingClient = new Proxy(
  {} as ReturnType<typeof createBrowserClient>,
  {
    get() {
      throw new Error(missingEnvMessage);
    },
  }
);

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

if (hasConfig && !supabaseInitError) {
  try {
    browserClient = createBrowserClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
      },
    });
  } catch {
    supabaseInitError =
      'Supabase client failed to initialize. Re-check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.';
  }
}

export const SUPABASE_CONFIGURED = hasConfig && !supabaseInitError;
export const SUPABASE_INIT_ERROR = supabaseInitError;
export const supabase = browserClient ?? missingClient;
