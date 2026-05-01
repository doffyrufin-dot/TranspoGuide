-- Canonicalize vehicle spelling: Trycicle -> Tricycle
-- Safe to run once after normalization rollout.

begin;

do $$
declare
  canonical_id uuid;
  typo_id uuid;
begin
  select id
  into canonical_id
  from public.tbl_vehicle_types
  where lower(trim(name)) = 'tricycle'
  order by created_at asc nulls last, id asc
  limit 1;

  select id
  into typo_id
  from public.tbl_vehicle_types
  where lower(trim(name)) = 'trycicle'
  order by created_at asc nulls last, id asc
  limit 1;

  if typo_id is not null then
    if canonical_id is null then
      update public.tbl_vehicle_types
      set name = 'Tricycle',
          updated_at = now()
      where id = typo_id;
      canonical_id := typo_id;
    else
      -- Move junction rows safely (avoid unique collisions).
      insert into public.tbl_destination_vehicle_types (
        destination_id,
        vehicle_type_id,
        created_at
      )
      select
        destination_id,
        canonical_id,
        created_at
      from public.tbl_destination_vehicle_types
      where vehicle_type_id = typo_id
      on conflict (destination_id, vehicle_type_id) do nothing;

      delete from public.tbl_destination_vehicle_types
      where vehicle_type_id = typo_id;

      insert into public.tbl_barangay_vehicle_types (
        barangay_fare_id,
        vehicle_type_id,
        created_at
      )
      select
        barangay_fare_id,
        canonical_id,
        created_at
      from public.tbl_barangay_vehicle_types
      where vehicle_type_id = typo_id
      on conflict (barangay_fare_id, vehicle_type_id) do nothing;

      delete from public.tbl_barangay_vehicle_types
      where vehicle_type_id = typo_id;

      update public.tbl_route_fares
      set vehicle_type_id = canonical_id
      where vehicle_type_id = typo_id;

      delete from public.tbl_vehicle_types
      where id = typo_id;
    end if;
  end if;
end;
$$;

-- Deduplicate rows that only differ by typo/canonical spelling before update.
with ranked as (
  select
    id,
    row_number() over (
      partition by lower(trim(origin)), lower(trim(destination)), 'tricycle'
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.tbl_route_fares
  where lower(trim(vehicle_type)) in ('trycicle', 'tricycle')
)
delete from public.tbl_route_fares rf
using ranked r
where rf.id = r.id
  and r.rn > 1
  and lower(trim(rf.vehicle_type)) in ('trycicle', 'tricycle');

update public.tbl_route_fares
set vehicle_type = 'Tricycle',
    updated_at = now()
where lower(trim(vehicle_type)) = 'trycicle';

with ranked as (
  select
    id,
    row_number() over (
      partition by lower(trim(origin)), lower(trim(destination)), 'tricycle'
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.tbl_route_metrics_cache
  where lower(trim(vehicle_type)) in ('trycicle', 'tricycle')
)
delete from public.tbl_route_metrics_cache c
using ranked r
where c.id = r.id
  and r.rn > 1
  and lower(trim(c.vehicle_type)) in ('trycicle', 'tricycle');

update public.tbl_route_metrics_cache
set vehicle_type = 'Tricycle',
    updated_at = now()
where lower(trim(vehicle_type)) = 'trycicle';

commit;

-- Verify:
-- select * from public.tbl_vehicle_types where lower(trim(name)) like '%trycicle%';
-- select count(*) from public.tbl_route_fares where lower(trim(vehicle_type)) like '%trycicle%';
-- select count(*) from public.tbl_route_metrics_cache where lower(trim(vehicle_type)) like '%trycicle%';
