-- Phase 2 test: screen_site() against values worked out by hand.
--
-- Expected values come from the gov.uk rates (checked 2026-10-15) applied to
-- raw overlap areas from layers.site_overlaps(), not from the rules engine.
-- Every value the engine returns must match an expected row, and vice versa.
--
--   docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_screen_site.sql

\pset pager off
\timing off
set search_path = extensions, public;

create temporary table cases (id text primary key, public_access boolean, blocks jsonb);

-- Blocks are 300 m squares on British National Grid, sent as lon/lat GeoJSON.
create function pg_temp.fc(variadic boxes geometry[]) returns jsonb language sql as $$
  select jsonb_build_object('type', 'FeatureCollection', 'features', jsonb_agg(
    jsonb_build_object('type', 'Feature', 'properties', jsonb_build_object('name', 'Block ' || i),
      'geometry', st_asgeojson(st_transform(b, 4326), 9)::jsonb) order by i))
  from unnest(boxes) with ordinality as t(b, i);
$$;

insert into cases values
  ('1 fine',         true,  pg_temp.fc(st_makeenvelope(511000, 272000, 511300, 272300, 27700))),
  ('2 sssi',         true,  pg_temp.fc(st_makeenvelope(517904, 270037, 518204, 270337, 27700))),
  ('3 fen',          true,  pg_temp.fc(st_makeenvelope(532852, 285459, 533152, 285759, 27700))),
  ('4a riparian',    true,  pg_temp.fc(st_makeenvelope(529500, 261500, 529800, 261800, 27700))),
  ('4b riparian',    false, pg_temp.fc(st_makeenvelope(529500, 261500, 529800, 261800, 27700))),
  ('5 sssi edge',    true,  pg_temp.fc(st_makeenvelope(542750, 246250, 543050, 246550, 27700),
                                       st_makeenvelope(543060, 246250, 543085, 246275, 27700)));

-- Hand-worked expectations: (case, key, value, tolerance)
create temporary table expected (id text, key text, value numeric, tol numeric default 0);
insert into expected (id, key, value, tol) values
  -- 1: 9 ha, nothing removed. NR lower 9 x 1,100; WQ 9 x 500; riparian 3.028 x 2,500;
  --    fully inside low sensitivity v4 -> 9 x 1,100; maintenance 9 x 400 x 15; costs 9 x 10,200.
  ('1 fine', 'site eligible_ha', 9.00, 0), ('1 fine', 'site meets_minimum', 1, 0),
  ('1 fine', 'site low_sensitivity', 1, 0),
  ('1 fine', 'block 1 eligible_ha', 9.00, 0), ('1 fine', 'block 1 meets_minimum', 1, 0),
  ('1 fine', 'one_off nature_recovery_lower', 9900, 0), ('1 fine', 'one_off water_quality', 4500, 0),
  ('1 fine', 'one_off riparian', 7570, 3), ('1 fine', 'one_off low_sensitivity', 9900, 0),
  ('1 fine', 'one_off total', 31870, 3), ('1 fine', 'maintenance per_year', 3600, 0),
  ('1 fine', 'maintenance 15y total', 54000, 0), ('1 fine', 'income total', 85870, 3),
  ('1 fine', 'costs planting up_to', 91800, 0),
  -- 2: whole block is SSSI (removed first; PHI and woodland underneath count as 0).
  ('2 sssi', 'site eligible_ha', 0, 0), ('2 sssi', 'site meets_minimum', 0, 0),
  ('2 sssi', 'site low_sensitivity', 0, 0), ('2 sssi', 'site flag site_below_minimum', 1, 0),
  ('2 sssi', 'block 1 removed sssi', 9.00, 0), ('2 sssi', 'block 1 eligible_ha', 0, 0),
  ('2 sssi', 'block 1 meets_minimum', 0, 0), ('2 sssi', 'block 1 flag block_below_minimum', 1, 0),
  ('2 sssi', 'one_off total', 0, 0), ('2 sssi', 'maintenance per_year', 0, 0),
  ('2 sssi', 'maintenance 15y total', 0, 0), ('2 sssi', 'income total', 0, 0),
  ('2 sssi', 'costs planting up_to', 0, 0),
  -- 3: whole block is deep peat -> removed; nothing left to flag or pay.
  ('3 fen', 'site eligible_ha', 0, 0), ('3 fen', 'site meets_minimum', 0, 0),
  ('3 fen', 'site low_sensitivity', 0, 0), ('3 fen', 'site flag site_below_minimum', 1, 0),
  ('3 fen', 'block 1 removed deep_peat', 9.00, 0), ('3 fen', 'block 1 eligible_ha', 0, 0),
  ('3 fen', 'block 1 meets_minimum', 0, 0), ('3 fen', 'block 1 flag block_below_minimum', 1, 0),
  ('3 fen', 'one_off total', 0, 0), ('3 fen', 'maintenance per_year', 0, 0),
  ('3 fen', 'maintenance 15y total', 0, 0), ('3 fen', 'income total', 0, 0),
  ('3 fen', 'costs planting up_to', 0, 0),
  -- 4a: 9 ha, Grade 2 flag. NR lower 9,900; flood 9 x 1,000; WQ 4,500; riparian 2.998 x 2,500;
  --     settlements 9 x 600; access (yes) 9 x 3,700; not in low sensitivity v4.
  ('4a riparian', 'site eligible_ha', 9.00, 0), ('4a riparian', 'site meets_minimum', 1, 0),
  ('4a riparian', 'site low_sensitivity', 0, 0),
  ('4a riparian', 'block 1 eligible_ha', 9.00, 0), ('4a riparian', 'block 1 meets_minimum', 1, 0),
  ('4a riparian', 'block 1 flag best_farmland', 9.00, 0),
  ('4a riparian', 'one_off nature_recovery_lower', 9900, 0), ('4a riparian', 'one_off flood_risk', 9000, 0),
  ('4a riparian', 'one_off water_quality', 4500, 0), ('4a riparian', 'one_off riparian', 7495, 3),
  ('4a riparian', 'one_off close_to_settlements', 5400, 0),
  ('4a riparian', 'one_off recreational_access', 33300, 0),
  ('4a riparian', 'one_off total', 69595, 3), ('4a riparian', 'maintenance per_year', 3600, 0),
  ('4a riparian', 'maintenance 15y total', 54000, 0), ('4a riparian', 'income total', 123595, 3),
  ('4a riparian', 'costs planting up_to', 91800, 0),
  -- 4b: same site, no public access -> recreational access not applied (would be 33,300).
  ('4b riparian', 'site eligible_ha', 9.00, 0), ('4b riparian', 'site meets_minimum', 1, 0),
  ('4b riparian', 'site low_sensitivity', 0, 0),
  ('4b riparian', 'block 1 eligible_ha', 9.00, 0), ('4b riparian', 'block 1 meets_minimum', 1, 0),
  ('4b riparian', 'block 1 flag best_farmland', 9.00, 0),
  ('4b riparian', 'one_off nature_recovery_lower', 9900, 0), ('4b riparian', 'one_off flood_risk', 9000, 0),
  ('4b riparian', 'one_off water_quality', 4500, 0), ('4b riparian', 'one_off riparian', 7495, 3),
  ('4b riparian', 'one_off close_to_settlements', 5400, 0),
  ('4b riparian', 'block 1 not_applied recreational_access', 33300, 0),
  ('4b riparian', 'one_off total', 36295, 3), ('4b riparian', 'maintenance per_year', 3600, 0),
  ('4b riparian', 'maintenance 15y total', 54000, 0), ('4b riparian', 'income total', 90295, 3),
  ('4b riparian', 'costs planting up_to', 91800, 0),
  -- 5: block 1 straddles the SSSI: 4.235 ha removed, 4.765 ha left (Grade 2, NR lower).
  --    Block 2 is 25 m x 25 m = 0.0625 ha: under 0.1 ha, so flagged and not paid.
  --    NR lower 4.765 x 1,100; maintenance 4.765 x 400 = 1,906/yr x 15; costs 4.765 x 10,200.
  ('5 sssi edge', 'site eligible_ha', 4.77, 0.01), ('5 sssi edge', 'site meets_minimum', 1, 0),
  ('5 sssi edge', 'site low_sensitivity', 0, 0),
  ('5 sssi edge', 'block 1 removed sssi', 4.24, 0.01), ('5 sssi edge', 'block 1 eligible_ha', 4.77, 0.01),
  ('5 sssi edge', 'block 1 meets_minimum', 1, 0), ('5 sssi edge', 'block 1 flag best_farmland', 4.77, 0.01),
  ('5 sssi edge', 'block 2 eligible_ha', 0.06, 0), ('5 sssi edge', 'block 2 meets_minimum', 0, 0),
  ('5 sssi edge', 'block 2 flag best_farmland', 0.06, 0),
  ('5 sssi edge', 'block 2 flag block_below_minimum', 1, 0),
  ('5 sssi edge', 'one_off nature_recovery_lower', 5242, 3), ('5 sssi edge', 'one_off total', 5242, 3),
  ('5 sssi edge', 'maintenance per_year', 1906, 1), ('5 sssi edge', 'maintenance 15y total', 28590, 15),
  ('5 sssi edge', 'income total', 33832, 18), ('5 sssi edge', 'costs planting up_to', 48604, 3);

-- Run the engine once per case, timing each call.
create temporary table results (id text, result jsonb, ms numeric);
do $$
declare c record; t0 timestamptz; r jsonb;
begin
  for c in select * from cases order by id loop
    t0 := clock_timestamp();
    r := public.screen_site(c.blocks, c.public_access);
    insert into results values (c.id, r, round(extract(epoch from clock_timestamp() - t0)::numeric * 1000, 1));
  end loop;
end $$;

-- Flatten each result into (key, value) rows.
create temporary view actual as
select id, 'site eligible_ha' key, (result #>> '{summary,eligible_ha}')::numeric value from results
union all select id, 'site meets_minimum', ((result #>> '{summary,meets_site_minimum}')::boolean)::int from results
union all select id, 'site low_sensitivity', ((result #>> '{summary,low_sensitivity_whole_site}')::boolean)::int from results
union all select id, 'site flag ' || (f ->> 'code'), 1 from results, jsonb_array_elements(result -> 'site_flags') f
union all select id, 'block ' || (b ->> 'block') || ' eligible_ha', (b ->> 'eligible_ha')::numeric
  from results, jsonb_array_elements(result -> 'blocks') b
union all select id, 'block ' || (b ->> 'block') || ' meets_minimum', ((b ->> 'meets_block_minimum')::boolean)::int
  from results, jsonb_array_elements(result -> 'blocks') b
union all select id, 'block ' || (b ->> 'block') || ' removed ' || (x ->> 'code'), (x ->> 'ha')::numeric
  from results, jsonb_array_elements(result -> 'blocks') b, jsonb_array_elements(b -> 'removed') x
union all select id, 'block ' || (b ->> 'block') || ' flag ' || (x ->> 'code'), coalesce((x ->> 'ha')::numeric, 1)
  from results, jsonb_array_elements(result -> 'blocks') b, jsonb_array_elements(b -> 'flags') x
union all select id, 'block ' || (b ->> 'block') || ' not_applied ' || (x ->> 'code'), (x ->> 'would_be_gbp')::numeric
  from results, jsonb_array_elements(result -> 'blocks') b, jsonb_array_elements(b -> 'not_applied') x
union all select id, 'one_off ' || (x ->> 'code'), (x ->> 'amount_gbp')::numeric
  from results, jsonb_array_elements(result #> '{income,one_off}') x
union all select id, 'one_off total', (result #>> '{income,one_off_total_gbp}')::numeric from results
union all select id, 'maintenance per_year', coalesce((result #>> '{income,annual_maintenance,per_year_gbp}')::numeric, 0) from results
union all select id, 'maintenance 15y total', coalesce((result #>> '{income,annual_maintenance,total_gbp}')::numeric, 0) from results
union all select id, 'income total', (result #>> '{income,total_income_gbp}')::numeric from results
union all select id, 'costs planting up_to', (result #>> '{costs_covered,planting_costs_up_to_gbp}')::numeric from results;

\echo
\echo === Expected (by hand) vs actual (screen_site) ===
select coalesce(e.id, a.id) as site, coalesce(e.key, a.key) as check, e.value as expected, a.value as actual,
       case when e.key is null then 'UNEXPECTED'
            when a.key is null then 'MISSING'
            when abs(e.value - a.value) <= e.tol then 'pass'
            else 'FAIL' end as status
from expected e full join actual a on a.id = e.id and a.key = e.key
order by 1, 2;

\echo === Summary ===
select count(*) filter (where status = 'pass') passed,
       count(*) filter (where status <> 'pass') problems
from (select case when e.key is null or a.key is null then 'x'
                  when abs(e.value - a.value) <= e.tol then 'pass' else 'x' end status
      from expected e full join actual a on a.id = e.id and a.key = e.key) s;

\echo === Time per call ===
select id, ms from results order by id;
