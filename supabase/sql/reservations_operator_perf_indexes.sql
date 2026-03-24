-- Performance indexes for operator reservation dashboard queries
-- Run once in Supabase SQL Editor.

create index if not exists idx_tbl_reservations_operator_created_desc
  on public.tbl_reservations (operator_user_id, created_at desc);

create index if not exists idx_tbl_reservations_operator_status_created_desc
  on public.tbl_reservations (operator_user_id, status, created_at desc);

