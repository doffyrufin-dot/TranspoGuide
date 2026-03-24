import { supabase } from '@/utils/supabase/client';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar: string;
}

export interface EmailSignUpInput {
  email: string;
  password: string;
  name: string;
  redirectTo: string;
}

export interface OperatorFormInput {
  full_name: string;
  email: string;
  contact_number: string;
  address: string;
  plate_number: string;
  vehicle_model: string;
  seating_capacity: string;
}

export interface OperatorFileInput {
  drivers_license: File | null;
  vehicle_registration: File | null;
  franchise_cert: File | null;
}

const toAuthUser = (user: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): AuthUser => ({
  id: user.id,
  email: user.email || '',
  name:
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    '',
  avatar: (user.user_metadata?.avatar_url as string) || '',
});

export async function getCurrentAuthUser(): Promise<AuthUser | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.user) return null;
  return toAuthUser(session.user);
}

export function onRegisterAuthStateChange(
  callback: (user: AuthUser | null) => void
): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(
    (_event: AuthChangeEvent, session: Session | null) => {
      if (session?.user) {
        callback(toAuthUser(session.user));
        return;
      }
      callback(null);
    }
  );

  return () => subscription.unsubscribe();
}

export async function signInWithGoogleForRegister(redirectTo: string) {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
}

export async function signUpWithEmail(input: EmailSignUpInput) {
  return supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.name },
      emailRedirectTo: input.redirectTo,
    },
  });
}

export async function signOutRegisterUser() {
  return supabase.auth.signOut();
}

const uploadOperatorDocument = async (file: File, folder: string) => {
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

export async function submitOperatorApplication(
  user: AuthUser,
  form: OperatorFormInput,
  files: OperatorFileInput
) {
  const urls: Record<string, string | null> = {
    drivers_license_url: null,
    vehicle_registration_url: null,
    franchise_cert_url: null,
  };

  if (files.drivers_license) {
    urls.drivers_license_url = await uploadOperatorDocument(
      files.drivers_license,
      'licenses'
    );
  }
  if (files.vehicle_registration) {
    urls.vehicle_registration_url = await uploadOperatorDocument(
      files.vehicle_registration,
      'registrations'
    );
  }
  if (files.franchise_cert) {
    urls.franchise_cert_url = await uploadOperatorDocument(
      files.franchise_cert,
      'franchises'
    );
  }

  const { error: applicationError } = await supabase
    .from('tbl_operator_applications')
    .insert({
      user_id: user.id,
      full_name: form.full_name,
      email: form.email,
      contact_number: form.contact_number,
      address: form.address,
      plate_number: form.plate_number,
      vehicle_model: form.vehicle_model,
      seating_capacity: parseInt(form.seating_capacity, 10) || 0,
      ...urls,
      status: 'pending',
    });

  if (applicationError) throw applicationError;

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
