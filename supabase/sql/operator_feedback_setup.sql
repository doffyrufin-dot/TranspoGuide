-- Operator feedback and rating table (run in Supabase SQL editor)

create extension if not exists pgcrypto;

create table if not exists public.tbl_operator_feedback (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.tbl_reservations(id) on delete cascade,
  operator_user_id uuid not null references auth.users(id) on delete cascade,
  commuter_name text,
  commuter_email text,
  rating smallint not null check (rating between 1 and 5),
  feedback text check (feedback is null or char_length(feedback) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists idx_tbl_operator_feedback_operator
  on public.tbl_operator_feedback (operator_user_id, created_at desc);

create index if not exists idx_tbl_operator_feedback_rating
  on public.tbl_operator_feedback (rating);
