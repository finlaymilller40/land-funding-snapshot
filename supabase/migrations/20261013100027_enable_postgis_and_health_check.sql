-- Phase 0: enable PostGIS and create a one-row table the front end can read
-- to prove the app is connected to the database.

-- PostGIS lives in the extensions schema, as Supabase recommends.
create extension if not exists postgis with schema extensions;

create table public.health_check (
  id smallint primary key,
  message text not null,
  checked_at timestamptz not null default now()
);

comment on table public.health_check is
  'Single test row read by the home page to confirm the database connection.';

-- RLS on from day one: anyone may read, no one may write through the API.
alter table public.health_check enable row level security;

create policy "Public read access"
  on public.health_check
  for select
  to anon, authenticated
  using (true);

-- Belt and braces: API roles get read-only table privileges as well.
revoke all on public.health_check from anon, authenticated;
grant select on public.health_check to anon, authenticated;

insert into public.health_check (id, message)
values (1, 'Hello from Supabase: the database connection works.');
