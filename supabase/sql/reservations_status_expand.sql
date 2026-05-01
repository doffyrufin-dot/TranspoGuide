-- Expand reservation status constraint for operator pickup and departed flow
-- Run this in Supabase SQL Editor on existing environments.

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
      'cancelled',
      'picked_up',
      'departed'
    )
  );
