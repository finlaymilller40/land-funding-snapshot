-- Check a database's layers and rules against the local reference load
-- (Cambridgeshire and Peterborough, downloads of 2026-10-15).
--
-- Source features and areas must match. Piece counts may differ by up to 1%
-- if the server's geometry library (GEOS) splits polygons slightly differently.
--
--   local:  docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/verify_load.sql
--   hosted: docker exec -i -e PGPASSWORD supabase_db_land-funding-snapshot \
--             psql "host=<pooler host> port=5432 dbname=postgres user=postgres.<ref> sslmode=require" < scripts/sql/verify_load.sql

\pset pager off

create temporary table expected (layer_id text, pieces int, features int, ha numeric);
insert into expected values
  ('alc_provisional',               4019,    71, 339587.8),
  ('ewco_flood_risk',              24516,  3991,  78867.2),
  ('ewco_keeping_rivers_cool',      6973,  3716,  28193.3),
  ('ewco_low_sensitivity',          1705,   970,  44291.5),
  ('ewco_low_sensitivity_v4',       1732,   861,  45123.9),
  ('ewco_nfc_social',                311,    40, 105208.6),
  ('ewco_priority_habitat_network',11245,  3761, 216347.0),
  ('ewco_water_quality',             136,     5, 125717.3),
  ('nfi_woodland',                  5819,  4744,  12506.9),
  ('peat_status',                  20388, 16727,  91844.8),
  ('priority_habitat',             14489, 10907,  23499.5),
  ('scheduled_monuments',            526,   338,   1726.2),
  ('sssi',                           360,   103,   8014.6);

\echo === Layers: expected vs this database ===
with actual as (
  select layer_id, count(*)::int pieces, count(distinct source_fid)::int features,
         round((sum(extensions.st_area(geom)) / 1e4)::numeric, 1) ha
  from layers.features group by 1
)
select coalesce(e.layer_id, a.layer_id) as layer,
       e.features as exp_features, a.features,
       e.ha as exp_ha, a.ha,
       e.pieces as exp_pieces, a.pieces,
       case when a.layer_id is null then 'MISSING'
            when e.layer_id is null then 'UNEXPECTED'
            when a.features = e.features and abs(a.ha - e.ha) <= 0.5
                 and abs(a.pieces - e.pieces) <= e.pieces * 0.01 then 'pass'
            else 'FAIL' end as status
from expected e full join actual a using (layer_id)
order by 1;

\echo === Region, rules and functions ===
select 'region area (ha)' as check, round((extensions.st_area(geom) / 1e4)::numeric, 1)::text as value,
       case when abs(extensions.st_area(geom) / 1e4 - 339587.8) <= 0.5 then 'pass' else 'FAIL' end as status
from layers.regions where id = 'cambridgeshire-and-peterborough'
union all select 'rules.ewco_rates rows', count(*)::text, case when count(*) = 11 then 'pass' else 'FAIL' end from rules.ewco_rates
union all select 'rules.ewco_exclusions rows', count(*)::text, case when count(*) = 5 then 'pass' else 'FAIL' end from rules.ewco_exclusions
union all select 'rules.ewco_flags rows', count(*)::text, case when count(*) = 2 then 'pass' else 'FAIL' end from rules.ewco_flags
union all select 'rules.settings rows', count(*)::text, case when count(*) = 8 then 'pass' else 'FAIL' end from rules.settings
union all select 'rules.messages rows', count(*)::text, case when count(*) = 10 then 'pass' else 'FAIL' end from rules.messages
union all select 'leftover staging tables', count(*)::text, case when count(*) = 0 then 'pass' else 'FAIL' end
  from pg_tables where schemaname = 'layers_staging'
union all select 'anon can run screen_site', has_function_privilege('anon', 'public.screen_site(jsonb, boolean)', 'execute')::text,
  case when has_function_privilege('anon', 'public.screen_site(jsonb, boolean)', 'execute') then 'pass' else 'FAIL' end
union all select 'anon can run region_outline', has_function_privilege('anon', 'public.region_outline()', 'execute')::text,
  case when has_function_privilege('anon', 'public.region_outline()', 'execute') then 'pass' else 'FAIL' end
union all select 'anon blocked from layers', has_schema_privilege('anon', 'layers', 'usage')::text,
  case when not has_schema_privilege('anon', 'layers', 'usage') then 'pass' else 'FAIL' end
union all select 'anon blocked from rules', has_schema_privilege('anon', 'rules', 'usage')::text,
  case when not has_schema_privilege('anon', 'rules', 'usage') then 'pass' else 'FAIL' end;

\echo === Database size (free tier limit: 500 MB) ===
select pg_size_pretty(pg_database_size(current_database())) as database_size,
       round(pg_database_size(current_database()) * 100.0 / (500 * 1024 * 1024)) || '%' as share_of_500_mb;
