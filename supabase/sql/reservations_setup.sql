-- Reservation + Seat Lock tables (run in Supabase SQL editor)

create extension if not exists pgcrypto;

create table if not exists public.tbl_reservations (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  passenger_email text,
  contact_number text not null,
  pickup_location text not null,
  route text not null,
  seat_labels text[] not null default '{}',
  seat_count integer not null default 0,
  amount_due numeric(12,2) not null default 0,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'pending_operator_approval', 'paid', 'confirmed', 'rejected', 'cancelled', 'picked_up', 'departed')),
  payment_id text,
  guest_token text not null default encode(gen_random_bytes(24), 'hex'),
  trip_key text not null,
  queue_id uuid,
  operator_user_id uuid references auth.users(id),
  lock_expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  operator_chat_seen_at timestamptz
);

create table if not exists public.tbl_seat_locks (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.tbl_reservations(id) on delete cascade,
  trip_key text not null,
  seat_label text not null,
  status text not null default 'locked'
    check (status in ('locked', 'reserved')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_tbl_seat_locks_trip_seat_active
  on public.tbl_seat_locks (trip_key, seat_label)
  where status in ('locked', 'reserved');

create index if not exists idx_tbl_reservations_trip_key
  on public.tbl_reservations (trip_key);

create index if not exists idx_tbl_reservations_status
  on public.tbl_reservations (status);

create unique index if not exists idx_tbl_reservations_guest_token
  on public.tbl_reservations (guest_token);

create index if not exists idx_tbl_reservations_operator
  on public.tbl_reservations (operator_user_id);

create index if not exists idx_tbl_reservations_queue
  on public.tbl_reservations (queue_id);

create index if not exists idx_tbl_reservations_passenger_email
  on public.tbl_reservations (passenger_email);

create index if not exists idx_tbl_seat_locks_reservation
  on public.tbl_seat_locks (reservation_id);

create table if not exists public.tbl_reservation_messages (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.tbl_reservations(id) on delete cascade,
  sender_type text not null check (sender_type in ('passenger', 'operator')),
  sender_name text,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tbl_reservation_messages_reservation
  on public.tbl_reservation_messages (reservation_id, created_at);
