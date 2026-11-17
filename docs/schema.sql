-- Run once in the dedicated Supabase project's SQL editor.
create table if not exists public.airport_snapshots (
  id text primary key check (id = 'main'),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.airport_snapshots enable row level security;
revoke all on public.airport_snapshots from anon, authenticated;
grant select, insert, update on public.airport_snapshots to service_role;
-- No public policies: only the server and the scheduled collector access this table.
