create extension if not exists pgcrypto;

create table if not exists public.tbl_route_metrics_cache (
  id uuid primary key default gen_random_uuid(),
  origin text not null,
  destination text not null,
  vehicle_type text not null,
  distance_km numeric(10, 2) not null check (distance_km > 0),
  duration_minutes integer not null check (duration_minutes > 0),
  provider text not null default 'google_directions',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_tbl_route_metrics_cache_route unique (origin, destination, vehicle_type)
);

create index if not exists idx_tbl_route_metrics_cache_route
  on public.tbl_route_metrics_cache (origin, destination, vehicle_type);

create or replace function public.set_tbl_route_metrics_cache_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tbl_route_metrics_cache_updated_at on public.tbl_route_metrics_cache;
create trigger trg_tbl_route_metrics_cache_updated_at
before update on public.tbl_route_metrics_cache
for each row
execute function public.set_tbl_route_metrics_cache_updated_at();

alter table public.tbl_route_metrics_cache enable row level security;

grant all privileges on public.tbl_route_metrics_cache to service_role;

drop policy if exists "route_metrics_cache_service_all" on public.tbl_route_metrics_cache;
create policy "route_metrics_cache_service_all"
on public.tbl_route_metrics_cache
for all
to service_role
using (true)
with check (true);

