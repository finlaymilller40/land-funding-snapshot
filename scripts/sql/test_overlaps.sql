-- Phase 1 test: which layers does each test site overlap, and by how much?
-- Each site is a 300 m x 300 m square (9 ha) on British National Grid.
--
--   docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_overlaps.sql

\pset pager off
\timing on

create temporary table test_sites (id text, description text, geom geometry(Polygon, 27700));
insert into test_sites values
  ('fine', 'Arable land between Spaldwick and Ellington (expect no hard constraints)',
   st_makeenvelope(511000, 272000, 511300, 272300, 27700)),
  ('sssi', 'Inside Brampton Wood SSSI, near Huntingdon',
   st_makeenvelope(517904, 270037, 518204, 270337, 27700)),
  ('fen',  'Fen farmland east of Ramsey (expect deep peat, ALC grade 1)',
   st_makeenvelope(532852, 285459, 533152, 285759, 27700));

\echo
\echo === Site 1: clearly fine ===
select o.* from test_sites t, layers.site_overlaps(t.geom) o where t.id = 'fine';

\echo === Site 2: on an SSSI ===
select o.* from test_sites t, layers.site_overlaps(t.geom) o where t.id = 'sssi';

\echo === Site 3: fen peat / grade 1 ===
select o.* from test_sites t, layers.site_overlaps(t.geom) o where t.id = 'fen';

\echo === Same function with a WGS84 (lon/lat) polygon, as the website would send ===
select o.* from layers.site_overlaps(
  st_transform((select geom from test_sites where id = 'fen'), 4326)) o;

\echo === Query plan for site 3 (should use features_geom_idx) ===
explain (analyze, buffers, costs off, summary on)
select * from layers.site_overlaps((select geom from test_sites where id = 'fen'));
