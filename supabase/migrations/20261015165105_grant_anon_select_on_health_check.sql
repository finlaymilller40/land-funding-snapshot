-- The hosted project has "Automatically expose new tables" turned off, so API
-- roles get no table privileges by default. Grant anon read access explicitly
-- so the "Public read access" RLS policy can take effect. Nothing else.
grant select on public.health_check to anon;
