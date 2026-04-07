-- Patch: enforce one active seat lock per (trip_key, seat_label)
-- Run once in Supabase SQL Editor for existing environments.

-- 1) Remove expired temporary locks so they don't block fresh reservations.
delete from public.tbl_seat_locks
where status = 'locked'
  and expires_at is not null
  and expires_at < now();

-- 2) Deduplicate active locks/reservations per seat, keeping the newest row.
with ranked as (
  select
    id,
    row_number() over (
      partition by trip_key, seat_label
      order by
        case when status = 'reserved' then 0 else 1 end,
        created_at desc,
        id desc
    ) as rn
  from public.tbl_seat_locks
  where status in ('locked', 'reserved')
)
delete from public.tbl_seat_locks l
using ranked r
where l.id = r.id
  and r.rn > 1;

-- 3) Enforce uniqueness across active statuses.
create unique index if not exists idx_tbl_seat_locks_trip_seat_active
  on public.tbl_seat_locks (trip_key, seat_label)
  where status in ('locked', 'reserved');

-- Optional: keep schema tidy by dropping the old locked-only unique index.
drop index if exists public.idx_tbl_seat_locks_trip_seat_locked;
