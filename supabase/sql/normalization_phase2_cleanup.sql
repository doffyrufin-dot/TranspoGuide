-- Phase 2: Cleanup old denormalized columns (run only after app uses normalized tables).
--
-- IMPORTANT:
-- - Run this only after code has switched reads/writes to:
--   - public.tbl_reservation_seats
--   - public.tbl_barangay_vehicle_types
-- - Keep this script for the final cutover window.
--
-- Rollback notes:
-- - Re-add dropped columns, then repopulate from normalized tables if needed.
-- - SQL rollback templates are included at the bottom.

begin;

-- Safety pre-checks (manual):
-- 1) Ensure migration parity before dropping columns.
-- select
--   (select coalesce(sum(cardinality(seat_labels)), 0) from public.tbl_reservations) as old_array_total,
--   (select count(*) from public.tbl_reservation_seats) as new_table_total;
--
-- select
--   (select coalesce(sum(cardinality(allowed_vehicle_types)), 0) from public.tbl_barangay_fares) as old_array_total,
--   (select count(*) from public.tbl_barangay_vehicle_types) as new_table_total;

alter table public.tbl_reservations
  drop column if exists seat_labels;

alter table public.tbl_barangay_fares
  drop column if exists allowed_vehicle_types;

commit;

-- Rollback SQL template (run only if you need to restore old columns):
-- alter table public.tbl_reservations
--   add column if not exists seat_labels text[] not null default '{}';
--
-- update public.tbl_reservations r
-- set seat_labels = coalesce(s.labels, '{}'::text[])
-- from (
--   select reservation_id, array_agg(seat_label order by seat_label) as labels
--   from public.tbl_reservation_seats
--   group by reservation_id
-- ) s
-- where s.reservation_id = r.id;
--
-- alter table public.tbl_barangay_fares
--   add column if not exists allowed_vehicle_types text[] not null default '{}';
--
-- update public.tbl_barangay_fares bf
-- set allowed_vehicle_types = coalesce(x.vehicle_names, '{}'::text[])
-- from (
--   select
--     bvt.barangay_fare_id,
--     array_agg(vt.name order by vt.name) as vehicle_names
--   from public.tbl_barangay_vehicle_types bvt
--   join public.tbl_vehicle_types vt on vt.id = bvt.vehicle_type_id
--   group by bvt.barangay_fare_id
-- ) x
-- where x.barangay_fare_id = bf.id;
