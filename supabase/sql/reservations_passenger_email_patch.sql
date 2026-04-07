-- Add passenger email for reservation status notifications (safe to re-run)

alter table public.tbl_reservations
  add column if not exists passenger_email text;

create index if not exists idx_tbl_reservations_passenger_email
  on public.tbl_reservations (passenger_email);

