create extension if not exists pgcrypto;

create table if not exists public.tbl_vehicle_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tbl_vehicle_destinations (
  id uuid primary key default gen_random_uuid(),
  origin text not null,
  destination text not null,
  area_type text not null default 'city',
  distance_km numeric(8, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_tbl_vehicle_destinations unique (origin, destination, area_type)
);

create table if not exists public.tbl_destination_vehicle_types (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.tbl_vehicle_destinations(id) on delete cascade,
  vehicle_type_id uuid not null references public.tbl_vehicle_types(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint uq_tbl_destination_vehicle_types unique (destination_id, vehicle_type_id)
);

create table if not exists public.tbl_route_fares (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid references public.tbl_vehicle_destinations(id),
  origin text not null,
  destination text not null,
  distance_km numeric(8, 2),
  vehicle_type_id uuid references public.tbl_vehicle_types(id),
  vehicle_type text not null,
  vehicle_image_url text,
  regular_fare numeric(10, 2) not null check (regular_fare > 0),
  discount_rate numeric(5, 4) not null default 0.20 check (discount_rate >= 0 and discount_rate <= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_tbl_route_fares_route_vehicle unique (origin, destination, vehicle_type)
);

create table if not exists public.tbl_barangay_fares (
  id uuid primary key default gen_random_uuid(),
  barangay_name text not null unique,
  distance_km numeric(8, 2) not null check (distance_km >= 0),
  tricycle_base_fare numeric(10, 2) not null default 15 check (tricycle_base_fare >= 0),
  per_km_increase numeric(10, 2) not null default 2 check (per_km_increase >= 0),
  allowed_vehicle_types text[] not null default '{}',
  is_highway boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tbl_route_fares
  add column if not exists destination_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tbl_route_fares_destination_id_fkey'
  ) then
    alter table public.tbl_route_fares
      add constraint tbl_route_fares_destination_id_fkey
      foreign key (destination_id) references public.tbl_vehicle_destinations(id);
  end if;
end;
$$;

alter table public.tbl_route_fares
  add column if not exists vehicle_type_id uuid;

alter table public.tbl_route_fares
  add column if not exists vehicle_image_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tbl_route_fares_vehicle_type_id_fkey'
  ) then
    alter table public.tbl_route_fares
      add constraint tbl_route_fares_vehicle_type_id_fkey
      foreign key (vehicle_type_id) references public.tbl_vehicle_types(id);
  end if;
end;
$$;

create index if not exists idx_tbl_route_fares_route
  on public.tbl_route_fares (origin, destination, is_active);

create index if not exists idx_tbl_route_fares_destination
  on public.tbl_route_fares (destination_id, is_active);

create index if not exists idx_tbl_route_fares_vehicle_type
  on public.tbl_route_fares (vehicle_type_id);

create index if not exists idx_tbl_destination_vehicle_types_destination
  on public.tbl_destination_vehicle_types (destination_id);

create index if not exists idx_tbl_destination_vehicle_types_vehicle
  on public.tbl_destination_vehicle_types (vehicle_type_id);

create index if not exists idx_tbl_barangay_fares_active
  on public.tbl_barangay_fares (is_active, barangay_name);

create or replace function public.set_tbl_route_fares_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_tbl_vehicle_types_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_tbl_vehicle_destinations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_tbl_barangay_fares_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tbl_route_fares_updated_at on public.tbl_route_fares;
create trigger trg_tbl_route_fares_updated_at
before update on public.tbl_route_fares
for each row
execute function public.set_tbl_route_fares_updated_at();

drop trigger if exists trg_tbl_vehicle_types_updated_at on public.tbl_vehicle_types;
create trigger trg_tbl_vehicle_types_updated_at
before update on public.tbl_vehicle_types
for each row
execute function public.set_tbl_vehicle_types_updated_at();

drop trigger if exists trg_tbl_vehicle_destinations_updated_at on public.tbl_vehicle_destinations;
create trigger trg_tbl_vehicle_destinations_updated_at
before update on public.tbl_vehicle_destinations
for each row
execute function public.set_tbl_vehicle_destinations_updated_at();

drop trigger if exists trg_tbl_barangay_fares_updated_at on public.tbl_barangay_fares;
create trigger trg_tbl_barangay_fares_updated_at
before update on public.tbl_barangay_fares
for each row
execute function public.set_tbl_barangay_fares_updated_at();

alter table public.tbl_route_fares enable row level security;
alter table public.tbl_vehicle_types enable row level security;
alter table public.tbl_vehicle_destinations enable row level security;
alter table public.tbl_destination_vehicle_types enable row level security;
alter table public.tbl_barangay_fares enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.tbl_route_fares to authenticated;
grant select on public.tbl_vehicle_types to authenticated;
grant select on public.tbl_vehicle_destinations to authenticated;
grant select on public.tbl_destination_vehicle_types to authenticated;
grant select, insert, update, delete on public.tbl_barangay_fares to authenticated;
grant all privileges on public.tbl_route_fares to service_role;
grant all privileges on public.tbl_vehicle_types to service_role;
grant all privileges on public.tbl_vehicle_destinations to service_role;
grant all privileges on public.tbl_destination_vehicle_types to service_role;
grant all privileges on public.tbl_barangay_fares to service_role;

drop policy if exists "route_fares_select_authenticated" on public.tbl_route_fares;
create policy "route_fares_select_authenticated"
on public.tbl_route_fares
for select
to authenticated
using (true);

drop policy if exists "route_fares_admin_insert" on public.tbl_route_fares;
create policy "route_fares_admin_insert"
on public.tbl_route_fares
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tbl_users u
    where u.user_id = auth.uid()
      and lower(u.role) = 'admin'
  )
);

drop policy if exists "route_fares_admin_update" on public.tbl_route_fares;
create policy "route_fares_admin_update"
on public.tbl_route_fares
for update
to authenticated
using (
  exists (
    select 1
    from public.tbl_users u
    where u.user_id = auth.uid()
      and lower(u.role) = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.tbl_users u
    where u.user_id = auth.uid()
      and lower(u.role) = 'admin'
  )
);

drop policy if exists "route_fares_admin_delete" on public.tbl_route_fares;
create policy "route_fares_admin_delete"
on public.tbl_route_fares
for delete
to authenticated
using (
  exists (
    select 1
    from public.tbl_users u
    where u.user_id = auth.uid()
      and lower(u.role) = 'admin'
  )
);

drop policy if exists "route_fares_service_all" on public.tbl_route_fares;
create policy "route_fares_service_all"
on public.tbl_route_fares
for all
to service_role
using (true)
with check (true);

drop policy if exists "barangay_fares_select_authenticated" on public.tbl_barangay_fares;
create policy "barangay_fares_select_authenticated"
on public.tbl_barangay_fares
for select
to authenticated
using (is_active = true);

drop policy if exists "barangay_fares_admin_insert" on public.tbl_barangay_fares;
create policy "barangay_fares_admin_insert"
on public.tbl_barangay_fares
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tbl_users u
    where u.user_id = auth.uid()
      and lower(u.role) = 'admin'
  )
);

drop policy if exists "barangay_fares_admin_update" on public.tbl_barangay_fares;
create policy "barangay_fares_admin_update"
on public.tbl_barangay_fares
for update
to authenticated
using (
  exists (
    select 1
    from public.tbl_users u
    where u.user_id = auth.uid()
      and lower(u.role) = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.tbl_users u
    where u.user_id = auth.uid()
      and lower(u.role) = 'admin'
  )
);

drop policy if exists "barangay_fares_admin_delete" on public.tbl_barangay_fares;
create policy "barangay_fares_admin_delete"
on public.tbl_barangay_fares
for delete
to authenticated
using (
  exists (
    select 1
    from public.tbl_users u
    where u.user_id = auth.uid()
      and lower(u.role) = 'admin'
  )
);

drop policy if exists "barangay_fares_service_all" on public.tbl_barangay_fares;
create policy "barangay_fares_service_all"
on public.tbl_barangay_fares
for all
to service_role
using (true)
with check (true);

drop policy if exists "vehicle_types_select_authenticated" on public.tbl_vehicle_types;
create policy "vehicle_types_select_authenticated"
on public.tbl_vehicle_types
for select
to authenticated
using (is_active = true);

drop policy if exists "vehicle_types_admin_insert" on public.tbl_vehicle_types;
create policy "vehicle_types_admin_insert"
on public.tbl_vehicle_types
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tbl_users u
    where u.user_id = auth.uid()
      and lower(u.role) = 'admin'
  )
);

drop policy if exists "vehicle_types_admin_update" on public.tbl_vehicle_types;
create policy "vehicle_types_admin_update"
on public.tbl_vehicle_types
for update
to authenticated
using (
  exists (
    select 1
    from public.tbl_users u
    where u.user_id = auth.uid()
      and lower(u.role) = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.tbl_users u
    where u.user_id = auth.uid()
      and lower(u.role) = 'admin'
  )
);

drop policy if exists "vehicle_types_service_all" on public.tbl_vehicle_types;
create policy "vehicle_types_service_all"
on public.tbl_vehicle_types
for all
to service_role
using (true)
with check (true);

drop policy if exists "vehicle_destinations_select_authenticated" on public.tbl_vehicle_destinations;
create policy "vehicle_destinations_select_authenticated"
on public.tbl_vehicle_destinations
for select
to authenticated
using (is_active = true);

drop policy if exists "vehicle_destinations_admin_insert" on public.tbl_vehicle_destinations;
create policy "vehicle_destinations_admin_insert"
on public.tbl_vehicle_destinations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tbl_users u
    where u.user_id = auth.uid()
      and lower(u.role) = 'admin'
  )
);

drop policy if exists "vehicle_destinations_admin_update" on public.tbl_vehicle_destinations;
create policy "vehicle_destinations_admin_update"
on public.tbl_vehicle_destinations
for update
to authenticated
using (
  exists (
    select 1
    from public.tbl_users u
    where u.user_id = auth.uid()
      and lower(u.role) = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.tbl_users u
    where u.user_id = auth.uid()
      and lower(u.role) = 'admin'
  )
);

drop policy if exists "vehicle_destinations_service_all" on public.tbl_vehicle_destinations;
create policy "vehicle_destinations_service_all"
on public.tbl_vehicle_destinations
for all
to service_role
using (true)
with check (true);

drop policy if exists "destination_vehicle_types_select_authenticated" on public.tbl_destination_vehicle_types;
create policy "destination_vehicle_types_select_authenticated"
on public.tbl_destination_vehicle_types
for select
to authenticated
using (true);

drop policy if exists "destination_vehicle_types_admin_insert" on public.tbl_destination_vehicle_types;
create policy "destination_vehicle_types_admin_insert"
on public.tbl_destination_vehicle_types
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tbl_users u
    where u.user_id = auth.uid()
      and lower(u.role) = 'admin'
  )
);

drop policy if exists "destination_vehicle_types_admin_delete" on public.tbl_destination_vehicle_types;
create policy "destination_vehicle_types_admin_delete"
on public.tbl_destination_vehicle_types
for delete
to authenticated
using (
  exists (
    select 1
    from public.tbl_users u
    where u.user_id = auth.uid()
      and lower(u.role) = 'admin'
  )
);

drop policy if exists "destination_vehicle_types_service_all" on public.tbl_destination_vehicle_types;
create policy "destination_vehicle_types_service_all"
on public.tbl_destination_vehicle_types
for all
to service_role
using (true)
with check (true);

insert into public.tbl_vehicle_types (name, image_url, is_active)
values
  ('Van', null, true),
  ('Bus', null, true),
  ('Minibus', null, true),
  ('Jeep', null, true),
  ('Multicab', null, true),
  ('Tricycle', null, true)
on conflict (name) do update
set is_active = true,
    updated_at = now();

insert into public.tbl_vehicle_destinations (origin, destination, area_type, distance_km, is_active)
values
  ('Isabel', 'Ormoc City', 'city', 43, true),
  ('Isabel', 'Palompon', 'municipality', 25, true),
  ('Isabel', 'Merida', 'municipality', 20, true),
  ('Isabel', 'Barangays (Isabel)', 'barangay', null, true)
on conflict (origin, destination, area_type) do update
set is_active = true,
    distance_km = excluded.distance_km,
    updated_at = now();

insert into public.tbl_destination_vehicle_types (destination_id, vehicle_type_id)
select d.id, v.id
from public.tbl_vehicle_destinations d
join public.tbl_vehicle_types v on (
  (d.destination = 'Ormoc City' and v.name in ('Van', 'Bus', 'Minibus', 'Jeep', 'Multicab')) or
  (d.destination = 'Palompon' and v.name in ('Van', 'Bus', 'Minibus', 'Jeep', 'Multicab')) or
  (d.destination = 'Merida' and v.name in ('Van', 'Bus', 'Minibus', 'Jeep', 'Multicab')) or
  (d.destination = 'Barangays (Isabel)' and v.name in ('Jeep', 'Multicab', 'Tricycle'))
)
on conflict (destination_id, vehicle_type_id) do nothing;

insert into public.tbl_barangay_fares (
  barangay_name,
  distance_km,
  tricycle_base_fare,
  per_km_increase,
  allowed_vehicle_types,
  is_highway,
  is_active
)
values
  ('Libertad', 3, 15, 2, '{"Bus","Minibus","Multicab","Tricycle"}', true, true),
  ('Pingag', 5, 15, 2, '{"Bus","Minibus","Multicab","Tricycle"}', true, true),
  ('Matlang', 7, 15, 2, '{"Bus","Minibus","Multicab","Tricycle"}', true, true),
  ('Bilwang', 9, 15, 2, '{"Bus","Minibus","Multicab","Tricycle"}', true, true),
  ('Tubod', 11, 15, 2, '{"Bus","Minibus","Multicab","Tricycle"}', true, true),
  ('Tolingon', 13, 15, 2, '{"Bus","Minibus","Multicab","Tricycle"}', true, true),
  ('Apale', 15, 15, 2, '{"Bus","Minibus","Multicab","Tricycle"}', true, true)
on conflict (barangay_name) do update
set distance_km = excluded.distance_km,
    tricycle_base_fare = excluded.tricycle_base_fare,
    per_km_increase = excluded.per_km_increase,
    allowed_vehicle_types = excluded.allowed_vehicle_types,
    is_highway = excluded.is_highway,
    is_active = true,
    updated_at = now();

update public.tbl_route_fares rf
set vehicle_type_id = vt.id
from public.tbl_vehicle_types vt
where rf.vehicle_type_id is null
  and lower(trim(rf.vehicle_type)) = lower(trim(vt.name));

update public.tbl_route_fares rf
set destination_id = d.id
from public.tbl_vehicle_destinations d
where rf.destination_id is null
  and lower(trim(rf.origin)) = lower(trim(d.origin))
  and lower(trim(rf.destination)) = lower(trim(d.destination));
