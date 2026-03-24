-- Route distance normalization / backfill
-- Run this once in Supabase SQL Editor.

begin;

-- 1) Canonical destination distances
update public.tbl_vehicle_destinations
set distance_km = 43,
    updated_at = now()
where lower(trim(origin)) = 'isabel'
  and lower(trim(destination)) = 'ormoc city';

-- 2) Backfill route fares by destination table distance
update public.tbl_route_fares rf
set distance_km = d.distance_km,
    updated_at = now()
from public.tbl_vehicle_destinations d
where lower(trim(rf.origin)) = lower(trim(d.origin))
  and lower(trim(rf.destination)) = lower(trim(d.destination))
  and d.distance_km is not null;

-- 3) Backfill barangay route distances from barangay table
update public.tbl_route_fares rf
set distance_km = bf.distance_km,
    updated_at = now()
from public.tbl_barangay_fares bf
where lower(trim(rf.origin)) = 'isabel'
  and lower(trim(rf.destination)) = lower(trim(bf.barangay_name))
  and bf.is_active = true;

-- 4) Optional support for reverse direction routes (if they exist)
update public.tbl_route_fares rf
set distance_km = 43,
    updated_at = now()
where lower(trim(rf.origin)) = 'ormoc city'
  and lower(trim(rf.destination)) = 'isabel';

commit;

-- Quick check
select origin, destination, vehicle_type, distance_km
from public.tbl_route_fares
where lower(trim(origin)) in ('isabel', 'ormoc city')
  and lower(trim(destination)) in ('ormoc city', 'isabel', 'palompon', 'merida')
order by origin, destination, vehicle_type;

