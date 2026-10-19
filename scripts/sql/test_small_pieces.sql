-- Tests for migration 20261019180000: pieces under 0.1 ha after removals are
-- left out (D62), and the new limitations with sources (D64, D65).
--
--   docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_small_pieces.sql

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

-- 1. A 30 m strip across a small, isolated Scheduled Monument (centre about
--    553802, 252554; nothing else excluded within 150 m). The monument plus
--    its 20 m buffer cuts the strip in two. Site 1's square is added as a
--    second field so the site meets the 1 ha minimum.
--    short: pieces about 25 m x 30 m (0.075 ha each): both under 0.1 ha, left out.
--    long:  pieces about 50 m x 30 m (0.15 ha each): both kept.
create temporary table strips as
select id, g,
       -- Independent recomputation from the layers: strip minus the buffered monument.
       (select array_agg(st_area(d.geom) order by st_area(d.geom))
        from st_dump(st_collectionextract(st_difference(g,
               (select st_union(st_buffer(f.geom, 20)) from layers.features f
                where f.layer_id = 'scheduled_monuments' and st_dwithin(f.geom, g, 20))), 3)) d) pieces_m2
from (values
  ('short', st_makeenvelope(553802 - 60, 252554 - 15, 553802 + 60, 252554 + 15, 27700)),
  ('long',  st_makeenvelope(553802 - 85, 252554 - 15, 553802 + 85, 252554 + 15, 27700))
) v(id, g);

create temporary table res as
select s.id, s.pieces_m2,
       public.screen_site(pg_temp.fc(s.g, st_makeenvelope(511000, 272000, 511300, 272300, 27700)), true) j
from strips s;

insert into checks select id, 'layers: strip is cut into 2 pieces', '2', array_length(pieces_m2, 1)::text,
  array_length(pieces_m2, 1) = 2 from res;
insert into checks select id, 'layers: piece sizes (m²)', case id when 'short' then 'both < 1000' else 'both >= 1000' end,
  array_to_string(array(select round(p) from unnest(pieces_m2) p), ', '),
  case id when 'short' then pieces_m2[2] < 1000 else pieces_m2[1] >= 1000 end from res;

-- short: everything left is in small pieces.
insert into checks select 'short', 'small_piece removed = sum of pieces', round(((pieces_m2[1] + pieces_m2[2]) / 1e4)::numeric, 2)::text,
  x ->> 'ha', abs((x ->> 'ha')::numeric - round(((pieces_m2[1] + pieces_m2[2]) / 1e4)::numeric, 2)) <= 0.01
from res, jsonb_array_elements(j -> 'blocks' -> 0 -> 'removed') x where id = 'short' and x ->> 'code' = 'small_piece';
insert into checks select 'short', 'eligible after small pieces', '0.00 / not paid',
  (j #>> '{blocks,0,eligible_ha}') || ' / ' || (j #>> '{blocks,0,meets_block_minimum}'),
  (j #>> '{blocks,0,eligible_ha}')::numeric = 0 and not (j #>> '{blocks,0,meets_block_minimum}')::boolean
from res where id = 'short';
insert into checks select 'short', 'no payments on the strip', '0', jsonb_array_length(j -> 'blocks' -> 0 -> 'payments')::text,
  jsonb_array_length(j -> 'blocks' -> 0 -> 'payments') = 0 from res where id = 'short';
insert into checks select 'short', 'small piece has a shape and a label', 'Piece under 0.1 ha',
  (select x -> 'properties' ->> 'reason' from jsonb_array_elements(j -> 'blocks' -> 0 -> 'geometry' -> 'removed') x
   where x -> 'properties' ->> 'code' = 'small_piece'),
  (select x -> 'properties' ->> 'reason' from jsonb_array_elements(j -> 'blocks' -> 0 -> 'geometry' -> 'removed') x
   where x -> 'properties' ->> 'code' = 'small_piece') = 'Piece under 0.1 ha'
from res where id = 'short';
-- Old rule check: the pieces together are over 0.1 ha, so before D62 this strip was paid.
insert into checks select 'short', 'pieces together are over 0.1 ha (paid before D62)', '> 1000 m²',
  round(pieces_m2[1] + pieces_m2[2])::text, pieces_m2[1] + pieces_m2[2] > 1000 from res where id = 'short';

-- long: both pieces kept, nothing removed as a small piece.
insert into checks select 'long', 'no small_piece removal', '0',
  (select count(*) from jsonb_array_elements(j -> 'blocks' -> 0 -> 'removed') x where x ->> 'code' = 'small_piece')::text,
  not exists (select 1 from jsonb_array_elements(j -> 'blocks' -> 0 -> 'removed') x where x ->> 'code' = 'small_piece')
from res where id = 'long';
insert into checks select 'long', 'eligible = both pieces', round(((pieces_m2[1] + pieces_m2[2]) / 1e4)::numeric, 2)::text,
  j #>> '{blocks,0,eligible_ha}',
  abs((j #>> '{blocks,0,eligible_ha}')::numeric - round(((pieces_m2[1] + pieces_m2[2]) / 1e4)::numeric, 2)) <= 0.01
from res where id = 'long';

-- 2. Limitations and sources ---------------------------------------------------
insert into checks
select 'limitations', 'includes ' || e.code, 'present', coalesce(m.code, 'missing'),
  exists (select 1 from res, jsonb_array_elements_text(res.j -> 'limitations') l where res.id = 'long' and l = m.text)
from (values ('land_control'), ('existing_agreements'), ('eia'), ('min_width')) e(code)
left join rules.messages m on m.code = e.code;
insert into checks select 'limitations', 'new limitations have a gov.uk source and date', '0 missing',
  count(*) || ' missing', count(*) = 0
from rules.messages where code in ('land_control', 'existing_agreements', 'eia', 'small_piece')
  and (source_url not like 'https://www.gov.uk/guidance/%' or date_checked is null);
insert into checks select 'sources', 'includes the forestry EIA page', 'present',
  (j -> 'sources') ? 'https://www.gov.uk/guidance/environmental-impact-assessments-for-woodland' || '',
  (j -> 'sources') ? 'https://www.gov.uk/guidance/environmental-impact-assessments-for-woodland'
from res where id = 'long';

-- 3. Fail closed without the small-piece wording -------------------------------
do $$
declare msg text;
begin
  begin
    delete from rules.messages where code = 'small_piece';
    perform public.screen_site(pg_temp.fc(st_makeenvelope(511000, 272000, 511300, 272300, 27700)), true);
    msg := '(no error)';
    raise exception 'rollback';
  exception when others then
    if msg is null then msg := sqlerrm; end if;
  end;
  insert into checks values ('fail closed', 'refuses without small_piece wording', 'rules.settings is incomplete',
    msg, msg like '%rules.settings is incomplete%');
end $$;
insert into checks select 'fail closed', 'wording restored after the test', '1',
  count(*)::text, count(*) = 1 from rules.messages where code = 'small_piece';

\echo === Small pieces and new limitations ===
select area, check_name, expected, actual, case when ok then 'pass' else 'FAIL' end as status
from checks order by area, check_name;
select count(*) filter (where ok) passed, count(*) filter (where not ok or ok is null) problems from checks;
