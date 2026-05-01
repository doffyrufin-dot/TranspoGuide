-- Phase 1: Normalize seats + barangay vehicle types without downtime.
-- Safe to run multiple times.
--
-- What this does:
-- 1) Creates normalized tables:
--    - public.tbl_reservation_seats
--    - public.tbl_barangay_vehicle_types
-- 2) Backfills data from existing array columns:
--    - tbl_reservations.seat_labels
--    - tbl_barangay_fares.allowed_vehicle_types
-- 3) Adds FK: tbl_reservations.queue_id -> tbl_van_queue.id
-- 4) Leaves old columns intact for compatibility.
--
-- Rollback notes:
-- - This script is additive. If you must roll back, you can:
--   a) Drop FK tbl_reservations_queue_id_fkey
--   b) Drop tables tbl_reservation_seats and tbl_barangay_vehicle_types
-- - Existing old columns are untouched, so app behavior remains compatible.

begin;

create extension if not exists pgcrypto;

create table if not exists public.tbl_reservation_seats (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.tbl_reservations(id) on delete cascade,
  seat_label text not null,
  created_at timestamptz not null default now(),
  constraint chk_tbl_reservation_seats_label_not_blank check (length(trim(seat_label)) > 0),
  constraint uq_tbl_reservation_seats_reservation_seat unique (reservation_id, seat_label)
);

create index if not exists idx_tbl_reservation_seats_reservation
  on public.tbl_reservation_seats (reservation_id);

create index if not exists idx_tbl_reservation_seats_seat_label
  on public.tbl_reservation_seats (seat_label);

create table if not exists public.tbl_barangay_vehicle_types (
  id uuid primary key default gen_random_uuid(),
  barangay_fare_id uuid not null references public.tbl_barangay_fares(id) on delete cascade,
  vehicle_type_id uuid not null references public.tbl_vehicle_types(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint uq_tbl_barangay_vehicle_types unique (barangay_fare_id, vehicle_type_id)
);

create index if not exists idx_tbl_barangay_vehicle_types_barangay
  on public.tbl_barangay_vehicle_types (barangay_fare_id);

create index if not exists idx_tbl_barangay_vehicle_types_vehicle
  on public.tbl_barangay_vehicle_types (vehicle_type_id);

-- Clean orphan queue_id values first so FK can be added safely.
update public.tbl_reservations r
set queue_id = null
where r.queue_id is not null
  and not exists (
    select 1
    from public.tbl_van_queue q
    where q.id = r.queue_id
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tbl_reservations_queue_id_fkey'
  ) then
    alter table public.tbl_reservations
      add constraint tbl_reservations_queue_id_fkey
      foreign key (queue_id) references public.tbl_van_queue(id) on delete set null;
  end if;
end;
$$;

insert into public.tbl_reservation_seats (reservation_id, seat_label)
select distinct
  r.id as reservation_id,
  trim(s.seat_label) as seat_label
from public.tbl_reservations r
cross join lateral unnest(coalesce(r.seat_labels, '{}'::text[])) as s(seat_label)
where trim(coalesce(s.seat_label, '')) <> ''
on conflict (reservation_id, seat_label) do nothing;

insert into public.tbl_barangay_vehicle_types (barangay_fare_id, vehicle_type_id)
select distinct
  bf.id as barangay_fare_id,
  vt.id as vehicle_type_id
from public.tbl_barangay_fares bf
cross join lateral unnest(coalesce(bf.allowed_vehicle_types, '{}'::text[])) as a(vehicle_name)
join public.tbl_vehicle_types vt
  on lower(trim(vt.name)) = lower(trim(a.vehicle_name))
where trim(coalesce(a.vehicle_name, '')) <> ''
on conflict (barangay_fare_id, vehicle_type_id) do nothing;

alter table public.tbl_reservation_seats enable row level security;
alter table public.tbl_barangay_vehicle_types enable row level security;

grant select on public.tbl_reservation_seats to authenticated;
grant select on public.tbl_barangay_vehicle_types to authenticated;
grant all privileges on public.tbl_reservation_seats to service_role;
grant all privileges on public.tbl_barangay_vehicle_types to service_role;

drop policy if exists "reservation_seats_select_authenticated" on public.tbl_reservation_seats;
create policy "reservation_seats_select_authenticated"
on public.tbl_reservation_seats
for select
to authenticated
using (true);

drop policy if exists "reservation_seats_service_all" on public.tbl_reservation_seats;
create policy "reservation_seats_service_all"
on public.tbl_reservation_seats
for all
to service_role
using (true)
with check (true);

drop policy if exists "barangay_vehicle_types_select_authenticated" on public.tbl_barangay_vehicle_types;
create policy "barangay_vehicle_types_select_authenticated"
on public.tbl_barangay_vehicle_types
for select
to authenticated
using (true);

drop policy if exists "barangay_vehicle_types_service_all" on public.tbl_barangay_vehicle_types;
create policy "barangay_vehicle_types_service_all"
on public.tbl_barangay_vehicle_types
for all
to service_role
using (true)
with check (true);

commit;

-- Validation queries (optional):
-- 1) Expected parity check for reservation seats:
-- select
--   (select coalesce(sum(cardinality(seat_labels)), 0) from public.tbl_reservations) as old_array_total,
--   (select count(*) from public.tbl_reservation_seats) as new_table_total;
--
-- 2) Expected parity check for barangay vehicle mappings:
-- select
--   (select coalesce(sum(cardinality(allowed_vehicle_types)), 0) from public.tbl_barangay_fares) as old_array_total,
--   (select count(*) from public.tbl_barangay_vehicle_types) as new_table_total;
--
-- Emergency rollback commands:
-- alter table public.tbl_reservations drop constraint if exists tbl_reservations_queue_id_fkey;
-- drop table if exists public.tbl_barangay_vehicle_types;
-- drop table if exists public.tbl_reservation_seats;
