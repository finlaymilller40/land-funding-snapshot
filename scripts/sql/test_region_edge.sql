-- Tests for the region boundary switch to ONS BFE (D66) and land outside the
-- region being left out rather than refused (D67, migration 20261019200000).
--
--   docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_region_edge.sql

\pset pager off
\timing off
set search_path = extensions, public;

create function pg_temp.fc(variadic boxes geometry[]) returns jsonb language sql as $$
  select jsonb_build_object('type', 'FeatureCollection', 'features', jsonb_agg(
    jsonb_build_object('type', 'Feature', 'properties', jsonb_build_object('name', 'Block ' || i),
      'geometry', st_asgeojson(st_transform(b, 4326), 9)::jsonb) order by i))
  from unnest(boxes) with ordinality as t(b, i);
$$;

-- Share of a geometry outside the region, worked out from layers.regions.
create function pg_temp.outside_share(g geometry) returns numeric language sql as $$
  select (coalesce(st_area(st_difference(g, (select st_union(geom) from layers.regions))), st_area(g)) / st_area(g))::numeric;
$$;

-- screen_site(), or the refusal message.
create function pg_temp.try(site jsonb) returns jsonb language plpgsql as $$
begin
  return public.screen_site(site, false);
exception when sqlstate '22023' then
  return jsonb_build_object('refused', sqlerrm);
end $$;

create temporary table checks (area text, check_name text, expected text, actual text, ok boolean);

-- 1. BFE: the tidal channels are inside the region ------------------------------
-- Points in the middle of the tidal Nene and the Earith channel, which the
-- clipped (BFC) boundary used to leave out.
insert into checks
select 'bfe', 'tidal channel point inside region: ' || n, 'true',
  st_intersects(st_setsrid(st_point(x, y), 27700), (select st_union(geom) from layers.regions))::text,
  st_intersects(st_setsrid(st_point(x, y), 27700), (select st_union(geom) from layers.regions))
from (values ('Nene', 540789, 304326), ('Earith channel', 546083, 283103)) v(n, x, y);

create temporary table nene as
select pg_temp.try(pg_temp.fc(st_makeenvelope(540789 - 150, 304326 - 150, 540789 + 150, 304326 + 150, 27700))) j;
insert into checks select 'bfe', 'field across the Nene accepted, nothing outside', 'accepted, 0 outside',
  coalesce(j ->> 'refused', 'accepted, ' || (select count(*) from jsonb_array_elements(j -> 'blocks' -> 0 -> 'removed') x
                                              where x ->> 'code' = 'outside_region') || ' outside'),
  j ? 'summary' and not exists (select 1 from jsonb_array_elements(j -> 'blocks' -> 0 -> 'removed') x
                                where x ->> 'code' = 'outside_region')
from nene;

-- 2. At the outer (western) edge ------------------------------------------------
-- 200 m squares slid across the boundary near 502500, 285000; pick the ones
-- about 30% and 80% outside.
create temporary table edge as
with p as (
  select st_closestpoint(st_exteriorring((st_dump(geom)).geom), st_setsrid(st_point(502500, 285000), 27700)) pt
  from layers.regions order by st_distance(geom, st_setsrid(st_point(502500, 285000), 27700)) limit 1
),
slides as (
  select dx, st_expand(st_translate(p.pt, dx, 0), 100) g from p, generate_series(-150, 150, 5) dx
)
select g, pg_temp.outside_share(g) share from slides;

create temporary table cases as
select 'partly (about 30%)' id, (select g from edge order by abs(share - 0.30) limit 1) g
union all select 'mostly (about 80%)', (select g from edge order by abs(share - 0.80) limit 1)
union all select 'entirely', st_makeenvelope(494000, 280000, 494300, 280300, 27700);

create temporary table res as
select id, g, pg_temp.outside_share(g) share, pg_temp.try(pg_temp.fc(g)) j from cases;

insert into checks select id, 'share outside (from layers.regions)',
  case id when 'partly (about 30%)' then '0.20-0.40' when 'mostly (about 80%)' then '0.70-0.90' else '1' end,
  round(share, 3)::text,
  case id when 'partly (about 30%)' then share between 0.20 and 0.40
          when 'mostly (about 80%)' then share between 0.70 and 0.90 else share = 1 end
from res;

insert into checks select id, 'refused', 'site is outside the area we have data for…', coalesce(j ->> 'refused', '(accepted)'),
  (j ->> 'refused') like 'site is outside the area we have data for%'
from res where id in ('mostly (about 80%)', 'entirely');

insert into checks select id, 'accepted with outside part left out', round((share * st_area(g) / 1e4)::numeric, 2)::text,
  coalesce(j ->> 'refused', x ->> 'ha'),
  abs((x ->> 'ha')::numeric - round((share * st_area(g) / 1e4)::numeric, 2)) <= 0.01
from res left join lateral (select x from jsonb_array_elements(j -> 'blocks' -> 0 -> 'removed') x
                            where x ->> 'code' = 'outside_region') o on true
where id = 'partly (about 30%)';
insert into checks select id, 'nothing paid on the outside part', '<= ' || round(((1 - share) * st_area(g) / 1e4)::numeric, 2),
  j #>> '{blocks,0,eligible_ha}',
  (j #>> '{blocks,0,eligible_ha}')::numeric <= round(((1 - share) * st_area(g) / 1e4)::numeric, 2) + 0.01
from res where id = 'partly (about 30%)';
insert into checks select id, 'outside part has a shape and a label', 'Outside the area we cover',
  (select x -> 'properties' ->> 'reason' from jsonb_array_elements(j -> 'blocks' -> 0 -> 'geometry' -> 'removed') x
   where x -> 'properties' ->> 'code' = 'outside_region'),
  (select x -> 'properties' ->> 'reason' from jsonb_array_elements(j -> 'blocks' -> 0 -> 'geometry' -> 'removed') x
   where x -> 'properties' ->> 'code' = 'outside_region') = 'Outside the area we cover'
from res where id = 'partly (about 30%)';

-- 3. A site with one field entirely outside but most land inside --------------
-- Site 1's 9 ha square plus a 1 ha square outside: 10% outside, so accepted;
-- the outside field is left out entirely.
create temporary table mixed as
select pg_temp.try(pg_temp.fc(st_makeenvelope(511000, 272000, 511300, 272300, 27700),
                             st_makeenvelope(494000, 280000, 494100, 280100, 27700))) j;
insert into checks select 'mixed', 'accepted', 'accepted', coalesce(j ->> 'refused', 'accepted'), j ? 'summary' from mixed;
insert into checks select 'mixed', 'outside field: all left out, not paid', '1.00 ha outside / 0.00 eligible',
  (select x ->> 'ha' from jsonb_array_elements(j -> 'blocks' -> 1 -> 'removed') x where x ->> 'code' = 'outside_region')
    || ' ha outside / ' || (j #>> '{blocks,1,eligible_ha}') || ' eligible',
  (select (x ->> 'ha')::numeric from jsonb_array_elements(j -> 'blocks' -> 1 -> 'removed') x where x ->> 'code' = 'outside_region') = 1.00
  and (j #>> '{blocks,1,eligible_ha}')::numeric = 0
from mixed;
insert into checks select 'mixed', 'site 1 unchanged (one-off £31,871)', '31871',
  j #>> '{income,one_off_total_gbp}', (j #>> '{income,one_off_total_gbp}')::numeric = 31871 from mixed;

-- 4. Settings and wording, and failing closed ----------------------------------
insert into checks select 'settings', 'max_outside_share_pct', '50', rules.setting('max_outside_share_pct')::text,
  rules.setting('max_outside_share_pct') = 50;
do $$
declare m1 text; m2 text;
begin
  begin
    delete from rules.settings where key = 'max_outside_share_pct';
    perform public.screen_site(pg_temp.fc(st_makeenvelope(511000, 272000, 511300, 272300, 27700)), true);
    m1 := '(no error)'; raise exception 'rollback';
  exception when others then if m1 is null then m1 := sqlerrm; end if;
  end;
  begin
    delete from rules.messages where code = 'outside_region';
    perform public.screen_site(pg_temp.fc(st_makeenvelope(511000, 272000, 511300, 272300, 27700)), true);
    m2 := '(no error)'; raise exception 'rollback';
  exception when others then if m2 is null then m2 := sqlerrm; end if;
  end;
  insert into checks values
    ('fail closed', 'refuses without max_outside_share_pct', 'rules.settings is incomplete', m1, m1 like '%rules.settings is incomplete%'),
    ('fail closed', 'refuses without outside_region wording', 'rules.settings is incomplete', m2, m2 like '%rules.settings is incomplete%');
end $$;
insert into checks select 'fail closed', 'setting and wording restored', '1 / 1',
  (select count(*) from rules.settings where key = 'max_outside_share_pct') || ' / ' ||
  (select count(*) from rules.messages where code = 'outside_region'),
  (select count(*) from rules.settings where key = 'max_outside_share_pct') = 1
  and (select count(*) from rules.messages where code = 'outside_region') = 1;

\echo === Region edge: BFE boundary and land outside the region ===
select area, check_name, expected, actual, case when ok then 'pass' else 'FAIL' end as status
from checks order by area, check_name;
select count(*) filter (where ok) passed, count(*) filter (where not ok or ok is null) problems from checks;
