-- Login attempt limiter setup (run in Supabase SQL editor)

create extension if not exists pgcrypto;

create table if not exists public.tbl_login_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier text not null unique,
  failed_count integer not null default 0,
  locked_until timestamptz,
  last_failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tbl_login_attempts_locked_until
  on public.tbl_login_attempts (locked_until);
