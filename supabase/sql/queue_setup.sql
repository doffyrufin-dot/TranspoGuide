-- Queue table linked to operator user

create extension if not exists pgcrypto;

create table if not exists public.tbl_van_queue (
  id uuid primary key default gen_random_uuid(),
  operator_user_id uuid not null references auth.users(id),
  plate_number text not null,
  driver_name text,
  route text not null,
  departure_time timestamptz,
  queue_position integer not null default 0,
  status text not null default 'queued'
    check (status in ('queued', 'boarding', 'departed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tbl_van_queue_route_status
  on public.tbl_van_queue (route, status, queue_position);

create index if not exists idx_tbl_van_queue_operator
  on public.tbl_van_queue (operator_user_id);
