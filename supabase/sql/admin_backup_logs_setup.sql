-- Backup history table for admin exports (.sql / .csv)
create table if not exists public.tbl_admin_backup_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id),
  format text not null check (format in ('sql', 'csv')),
  table_name text,
  file_name text,
  status text not null check (status in ('success', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_tbl_admin_backup_logs_created_at
  on public.tbl_admin_backup_logs (created_at desc);
