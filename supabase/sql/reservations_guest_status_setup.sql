-- Guest reservation access + operator approval statuses
-- Run in Supabase SQL editor

alter table public.tbl_reservations
  add column if not exists guest_token text;

update public.tbl_reservations
set guest_token = encode(gen_random_bytes(24), 'hex')
where guest_token is null or guest_token = '';

alter table public.tbl_reservations
  alter column guest_token set not null;

create unique index if not exists idx_tbl_reservations_guest_token
  on public.tbl_reservations (guest_token);

alter table public.tbl_reservations
  drop constraint if exists tbl_reservations_status_check;

alter table public.tbl_reservations
  add constraint tbl_reservations_status_check
  check (
    status in (
      'pending_payment',
      'pending_operator_approval',
      'paid',
      'confirmed',
      'rejected',
      'cancelled'
    )
  );
