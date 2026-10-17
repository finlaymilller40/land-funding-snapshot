-- Phase 3b tests: inside-area and low/high ranges, large-block warning,
-- next steps, developed land, and site_context().
--
--   docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_explain_context.sql

\pset pager off
\timing off
set search_path = extensions, public;

create function pg_temp.fc(variadic boxes geometry[]) returns jsonb language sql as $$
  select jsonb_build_object('type', 'FeatureCollection', 'features', jsonb_agg(
    jsonb_build_object('type', 'Feature', 'properties', jsonb_build_object('name', 'Block ' || i),
      'geometry', st_asgeojson(st_transform(b, 4326), 9)::jsonb) order by i))
  from unnest(boxes) with ordinality as t(b, i);
$$;

create temporary table checks (area text, check_name text, expected text, actual text, ok boolean);

-- 1. Inside area and range on the Phase 2 sites -------------------------------
-- From the Phase 1 overlaps (by hand): site 1 lies fully inside the nature
-- recovery, water quality and low sensitivity v4 areas and 3.03 ha inside the
-- riparian buffer; site 4 fully inside flood (5.075 + 3.925), NfC social,
-- nature recovery and water quality, 3.00 ha inside the riparian buffer.
-- Touch-based payments on land fully inside their targets: low = high.
create temporary table r1 as select public.screen_site(pg_temp.fc(st_makeenvelope(511000, 272000, 511300, 272300, 27700)), true) j;
create temporary table r4 as select public.screen_site(pg_temp.fc(st_makeenvelope(529500, 261500, 529800, 261800, 27700)), true) j;

insert into checks
select 'site 1', 'inside_ha ' || (p ->> 'code'), e.v, p ->> 'inside_ha', abs((p ->> 'inside_ha')::numeric - e.v::numeric) <= 0.01
from r1, jsonb_array_elements(j -> 'blocks' -> 0 -> 'payments') p
join (values ('nature_recovery_lower', '9.00'), ('water_quality', '9.00'), ('riparian', '3.03'),
             ('low_sensitivity', '9.00'), ('maintenance', '9.00')) e(code, v) on e.code = p ->> 'code';
insert into checks select 'site 1', 'one-off low = high', j #>> '{income,one_off_total_gbp}', j #>> '{income,one_off_low_gbp}',
  (j #>> '{income,one_off_low_gbp}') = (j #>> '{income,one_off_total_gbp}') from r1;

insert into checks
select 'site 4', 'inside_ha ' || (p ->> 'code'), e.v, p ->> 'inside_ha', abs((p ->> 'inside_ha')::numeric - e.v::numeric) <= 0.01
from r4, jsonb_array_elements(j -> 'blocks' -> 0 -> 'payments') p
join (values ('flood_risk', '9.00'), ('close_to_settlements', '9.00'), ('recreational_access', '9.00'),
             ('nature_recovery_lower', '9.00'), ('water_quality', '9.00'), ('riparian', '3.00')) e(code, v) on e.code = p ->> 'code';
insert into checks select 'site 4', 'one-off low = high', j #>> '{income,one_off_total_gbp}', j #>> '{income,one_off_low_gbp}',
  (j #>> '{income,one_off_low_gbp}') = (j #>> '{income,one_off_total_gbp}') from r4;
-- Whole field inside the flood area: flagged, no duplicate shape (the map uses the field's shape).
insert into checks select 'site 4', 'flood: whole field qualifies, no duplicate shape', 'true / null',
  (p ->> 'qualifying_is_whole_field') || ' / ' || coalesce(p ->> 'qualifying_geometry', 'null'),
  (p ->> 'qualifying_is_whole_field')::boolean and p -> 'qualifying_geometry' = 'null'::jsonb
from r4, jsonb_array_elements(j -> 'blocks' -> 0 -> 'payments') p where p ->> 'code' = 'flood_risk';
-- Partly inside (site 1's riverside strip, 3.03 of 9 ha): shape area matches inside_ha.
insert into checks select 'site 1', 'riparian: qualifying shape area = inside_ha', p ->> 'inside_ha',
  round((st_area(st_transform(st_geomfromgeojson(p ->> 'qualifying_geometry'), 27700)) / 1e4)::numeric, 2)::text,
  abs(st_area(st_transform(st_geomfromgeojson(p ->> 'qualifying_geometry'), 27700)) / 1e4 - (p ->> 'inside_ha')::numeric) <= 0.02
from r1, jsonb_array_elements(j -> 'blocks' -> 0 -> 'payments') p where p ->> 'code' = 'riparian';

-- 2. The user-test case, scaled to the 400 ha limit: a 361 ha single block on the edge of Huntingdon ----
create temporary table big as select st_buffer(st_setsrid(st_point(524500, 272500), 27700), 950, 'endcap=square') g;
create temporary table rb as select public.screen_site(pg_temp.fc((select g from big)), true) j;

insert into checks select 'huntingdon', 'developed land removed (ha > 100)', '> 100',
  coalesce((select x ->> 'ha' from jsonb_array_elements(j -> 'blocks' -> 0 -> 'removed') x where x ->> 'code' = 'developed_land'), '0'),
  coalesce((select (x ->> 'ha')::numeric from jsonb_array_elements(j -> 'blocks' -> 0 -> 'removed') x where x ->> 'code' = 'developed_land'), 0) > 100
from rb;
insert into checks select 'huntingdon', 'large-block flag on block', 'present',
  case when exists (select 1 from jsonb_array_elements(j -> 'blocks' -> 0 -> 'flags') f where f ->> 'code' = 'large_block') then 'present' else 'absent' end,
  exists (select 1 from jsonb_array_elements(j -> 'blocks' -> 0 -> 'flags') f where f ->> 'code' = 'large_block') from rb;
insert into checks select 'huntingdon', 'summary has_large_block', 'true', j #>> '{summary,has_large_block}', (j #>> '{summary,has_large_block}')::boolean from rb;
insert into checks select 'huntingdon', 'low one-off < high one-off', '< ' || (j #>> '{income,one_off_total_gbp}'), j #>> '{income,one_off_low_gbp}',
  (j #>> '{income,one_off_low_gbp}')::numeric < (j #>> '{income,one_off_total_gbp}')::numeric from rb;
-- Independent check of inside_ha: plantable shape (returned) ∩ the payment's
-- target layer, straight from layers.features. 0.5% tolerance for the 1 m simplification.
insert into checks
select 'huntingdon', 'inside_ha ' || (p ->> 'code') || ' (independent)',
  round((st_area(st_intersection(el.g, tg.u)) / 1e4)::numeric, 1)::text, p ->> 'inside_ha',
  abs(st_area(st_intersection(el.g, tg.u)) / 1e4 - (p ->> 'inside_ha')::numeric)
    <= greatest(0.05, 0.005 * (p ->> 'inside_ha')::numeric)
from rb, jsonb_array_elements(j -> 'blocks' -> 0 -> 'payments') p
join rules.ewco_rates rt on rt.code = p ->> 'code' and rt.layer_id is not null and rt.qualification <> 'whole_site_inside'
cross join lateral (select st_collectionextract(st_makevalid(st_transform(st_geomfromgeojson(j #>> '{blocks,0,geometry,eligible}'), 27700)), 3) g) el
cross join lateral (select st_union(f.geom) u from layers.features f
                    where f.layer_id = rt.layer_id and (rt.qualifying_classes is null or f.class = any (rt.qualifying_classes))
                      and st_intersects(f.geom, el.g)) tg;
insert into checks
select 'huntingdon', 'low = rate x inside (' || (p ->> 'code') || ')',
  round((p ->> 'rate_gbp')::numeric * (p ->> 'inside_ha')::numeric)::text, p ->> 'low_amount_gbp',
  abs((p ->> 'low_amount_gbp')::numeric - (p ->> 'rate_gbp')::numeric * (p ->> 'inside_ha')::numeric) <= (p ->> 'rate_gbp')::numeric * 0.005 + 1
from rb, jsonb_array_elements(j -> 'blocks' -> 0 -> 'payments') p where p ->> 'kind' = 'one_off';

-- 3. Large-block threshold (50 ha) --------------------------------------------
create temporary table rt as select
  public.screen_site(pg_temp.fc(st_makeenvelope(509000, 268000, 509700, 268700, 27700)), true) j49,  -- 49.0 ha
  public.screen_site(pg_temp.fc(st_makeenvelope(509000, 268000, 509715, 268715, 27700)), true) j51;  -- 51.1 ha
insert into checks select 'threshold', '49 ha block: no large flag', 'absent',
  case when exists (select 1 from jsonb_array_elements(j49 -> 'blocks' -> 0 -> 'flags') f where f ->> 'code' = 'large_block') then 'present' else 'absent' end,
  not exists (select 1 from jsonb_array_elements(j49 -> 'blocks' -> 0 -> 'flags') f where f ->> 'code' = 'large_block') from rt;
insert into checks select 'threshold', '51 ha block: large flag', 'present',
  case when exists (select 1 from jsonb_array_elements(j51 -> 'blocks' -> 0 -> 'flags') f where f ->> 'code' = 'large_block') then 'present' else 'absent' end,
  exists (select 1 from jsonb_array_elements(j51 -> 'blocks' -> 0 -> 'flags') f where f ->> 'code' = 'large_block') from rt;
insert into checks select 'threshold', 'flag text names the threshold', 'mentions 50 ha',
  (select left(f ->> 'explanation', 30) from jsonb_array_elements(j51 -> 'blocks' -> 0 -> 'flags') f where f ->> 'code' = 'large_block'),
  (select f ->> 'explanation' like '%over 50 ha%' from jsonb_array_elements(j51 -> 'blocks' -> 0 -> 'flags') f where f ->> 'code' = 'large_block') from rt;

-- 4. Next steps -------------------------------------------------------------------
insert into checks select 'next steps', '9 ha site: planning grant shown', 'present',
  case when exists (select 1 from jsonb_array_elements(j -> 'next_steps') s where s ->> 'code' = 'planning_grant') then 'present' else 'absent' end,
  exists (select 1 from jsonb_array_elements(j -> 'next_steps') s where s ->> 'code' = 'planning_grant') from r1;
insert into checks select 'next steps', '4.77 ha site: planning grant hidden', 'absent',
  case when exists (select 1 from jsonb_array_elements(j -> 'next_steps') s where s ->> 'code' = 'planning_grant') then 'present' else 'absent' end,
  not exists (select 1 from jsonb_array_elements(j -> 'next_steps') s where s ->> 'code' = 'planning_grant')
from (select public.screen_site(pg_temp.fc(st_makeenvelope(542750, 246250, 543050, 246550, 27700)), true) j) x;
insert into checks select 'next steps', 'every step has a gov.uk source', 'all',
  (select count(*) filter (where s ->> 'source_url' like 'https://www.gov.uk/%') || ' of ' || count(*) from jsonb_array_elements(j -> 'next_steps') s),
  (select bool_and(s ->> 'source_url' like 'https://www.gov.uk/%') from jsonb_array_elements(j -> 'next_steps') s) from r1;

-- 5. site_context() ---------------------------------------------------------------
create temporary table sc as
  select g, public.site_context(pg_temp.fc(g)) j,
         clock_timestamp() t
  from (select st_makeenvelope(529500, 261500, 529800, 261800, 27700) g) x;
insert into checks select 'site_context', 'groups returned', (
    (select count(distinct (layer_id, qualifying_classes)) from rules.ewco_rates where layer_id is not null)
  + (select count(*) from rules.ewco_exclusions) + (select count(*) from rules.ewco_flags))::text,
  jsonb_array_length(j -> 'layers')::text,
  jsonb_array_length(j -> 'layers') = (select count(distinct (layer_id, qualifying_classes)) from rules.ewco_rates where layer_id is not null)
                                    + (select count(*) from rules.ewco_exclusions) + (select count(*) from rules.ewco_flags)
from sc;
insert into checks select 'site_context', 'nothing beyond 1 km (+5 m simplification)', '<= 1005 m',
  round(coalesce(max((select max(st_distance((d).geom, sc.g)) from st_dumppoints(st_transform(st_geomfromgeojson(l ->> 'geometry'), 27700)) d)), 0))::text
    || ' m (furthest point from the drawn land)',
  coalesce(bool_and(st_coveredby(st_transform(st_geomfromgeojson(l ->> 'geometry'), 27700), st_buffer(sc.g, 1005))), true)
from sc, jsonb_array_elements(sc.j -> 'layers') l where l ->> 'geometry' is not null;
insert into checks select 'site_context', 'flood target present near riparian site', 'shape',
  case when l ->> 'geometry' is null then 'none' else 'shape' end, l ->> 'geometry' is not null
from sc, jsonb_array_elements(sc.j -> 'layers') l where l ->> 'layer_id' = 'ewco_flood_risk';
insert into checks select 'site_context', 'only labels and shapes (no attributes)', 'id,kind,label,layer_id,payments,geometry',
  (select string_agg(k, ',' order by k) from jsonb_object_keys(sc.j -> 'layers' -> 0) k),
  (select array_agg(k order by k) from jsonb_object_keys(sc.j -> 'layers' -> 0) k) = array['geometry','id','kind','label','layer_id','payments']
from sc;
insert into checks select 'site_context', 'response size for a 9 ha site', '< 300 KB',
  round(length(j::text) / 1024.0)::text || ' KB', length(j::text) < 300 * 1024 from sc;

-- Same input checks as screen_site()
do $$
declare cases text[][] := array[
  ['point', '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[0,52]}}]}', 'block 1: geometry must be a Polygon or MultiPolygon'],
  ['outside region', '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-0.13,51.50],[-0.12,51.50],[-0.12,51.51],[-0.13,51.50]]]}}]}', 'site is outside the area we have data for%'],
  ['not a collection', '{"type":"Polygon","coordinates":[]}', 'site must be a GeoJSON FeatureCollection%']];
  c text[]; msg text;
begin
  foreach c slice 1 in array cases loop
    begin
      perform public.site_context(c[2]::jsonb);
      msg := '(no error)';
    exception when sqlstate '22023' then msg := sqlerrm;
    end;
    insert into checks values ('site_context', 'refuses ' || c[1], c[3], msg, msg like c[3]);
  end loop;
end $$;

-- Size limit (400 ha, rules.settings): both functions refuse a 450 ha site.
do $$
declare g geometry := st_buffer(st_setsrid(st_point(512000, 268000), 27700), 1061, 'endcap=square');  -- 450 ha
  m1 text; m2 text;
begin
  begin perform public.screen_site(pg_temp.fc(g), true); m1 := '(no error)';
  exception when sqlstate '22023' then m1 := sqlerrm; end;
  begin perform public.site_context(pg_temp.fc(g)); m2 := '(no error)';
  exception when sqlstate '22023' then m2 := sqlerrm; end;
  insert into checks values
    ('size limit', 'screen_site refuses 450 ha', 'site is larger than the 400 ha limit', m1, m1 = 'site is larger than the 400 ha limit'),
    ('size limit', 'site_context refuses 450 ha', 'site is larger than the 400 ha limit', m2, m2 = 'site is larger than the 400 ha limit');
end $$;

insert into checks select 'site_context', 'anon can execute', 'true', has_function_privilege('anon', 'public.site_context(jsonb)', 'execute')::text,
  has_function_privilege('anon', 'public.site_context(jsonb)', 'execute');
insert into checks select 'site_context', 'anon cannot run parse_site', 'false', has_function_privilege('anon', 'rules.parse_site(jsonb)', 'execute')::text,
  not has_function_privilege('anon', 'rules.parse_site(jsonb)', 'execute');

\echo === Phase 3b checks ===
select area, check_name, expected, actual, case when ok then 'pass' else 'FAIL' end as status
from checks order by area, check_name;
select count(*) filter (where ok) passed, count(*) filter (where not ok or ok is null) problems from checks;

\echo === Time and size at the largest allowed site (just under 400 ha, on the Huntingdon edge) ===
do $$
declare t0 timestamptz; t1 timestamptz; j jsonb; k jsonb;
  g geometry := st_buffer(st_setsrid(st_point(524500, 272500), 27700), 997, 'endcap=square');  -- 398 ha
begin
  t0 := clock_timestamp(); j := public.screen_site(pg_temp.fc(g), true);
  t1 := clock_timestamp(); k := public.site_context(pg_temp.fc(g));
  raise notice '% ha: screen_site % ms (% KB), site_context % ms (% KB)',
    round((st_area(g) / 1e4)::numeric),
    round(extract(epoch from t1 - t0)::numeric * 1000), round(length(j::text) / 1024.0),
    round(extract(epoch from clock_timestamp() - t1)::numeric * 1000), round(length(k::text) / 1024.0);
end $$;
