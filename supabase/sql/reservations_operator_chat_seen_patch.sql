alter table if exists public.tbl_reservations
  add column if not exists operator_chat_seen_at timestamptz;

comment on column public.tbl_reservations.operator_chat_seen_at
  is 'Timestamp when operator last opened/viewed the reservation chat thread.';
