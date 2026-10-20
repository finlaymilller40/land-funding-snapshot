-- Design pass tests: per-payment details ("what it entails") and bonuses
-- checked but not on this land.
--
--   docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_payment_details.sql

\pset pager off
\timing off
set search_path = extensions, public;

create function pg_temp.fc(variadic boxes geometry[]) returns jsonb language sql as $$
  select jsonb_build_object('type', 'FeatureCollection', 'features', jsonb_agg(
    jsonb_build_object('type', 'Feature', 'properties', jsonb_build_object('name', 'Block ' || i),
      'geometry', st_asgeojson(st_transform(b, 4326), 9)::jsonb) order by i))
  from unnest(boxes) with ordinality as t(b, i);
$$;

-- Does any feature of a layer (optionally some classes) touch a 27700 geometry?
create function pg_temp.touches(g geometry, layer text, classes text[] default null) returns boolean language sql as $$
  select exists (select 1 from layers.features f
                 where f.layer_id = layer and (classes is null or f.class = any (classes)) and st_intersects(f.geom, g));
$$;

-- "code:reason" pairs from not_on_this_land, sorted, for exact comparison.
create function pg_temp.not_here(j jsonb) returns text language sql as $$
  select coalesce(string_agg((x ->> 'code') || ':' || (x ->> 'reason'), ', ' order by x ->> 'code'), '')
  from jsonb_array_elements(j -> 'not_on_this_land') x;
$$;

-- Every code the result pays, costs or holds back for the access answer.
create function pg_temp.result_codes(j jsonb) returns text language sql as $$
  select coalesce(string_agg(distinct c, ',' order by c), '')
  from (select p ->> 'code' c
        from jsonb_array_elements(j -> 'blocks') b,
             jsonb_array_elements((b -> 'payments') || (b -> 'costs_covered') || (b -> 'not_applied')) p) s;
$$;

create function pg_temp.detail_codes(j jsonb) returns text language sql as $$
  select coalesce(string_agg(k, ',' order by k), '') from jsonb_object_keys(j -> 'payment_details') k;
$$;

create temporary table checks (area text, check_name text, expected text, actual text, ok boolean);

-- 1. Content tables -------------------------------------------------------------
insert into checks select 'content', 'every rate has details', '0 missing',
  count(*) || ' missing: ' || coalesce(string_agg(r.code, ', '), ''), count(*) = 0
from rules.ewco_rates r left join rules.payment_details d using (code) where d.code is null;

-- Wording only from the two gov.uk pages.
insert into checks select 'content', 'all sources are the EWCO guidance or the Additional contributions page', '0 other',
  count(*) || ' other', count(*) = 0
from (select source_url from rules.payment_details union all select source_url from rules.payment_items) s
where split_part(source_url, '#', 1) not in (
  'https://www.gov.uk/guidance/england-woodland-creation-offer',
  'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco');

insert into checks select 'content', 'every source has a section and a date checked', '0 missing', count(*) || ' missing', count(*) = 0
from (select source_section, date_checked from rules.payment_details
      union all select source_section, date_checked from rules.payment_items) s
where coalesce(trim(source_section), '') = '' or date_checked is null;

-- Every payment has its own checklist, except the low sensitivity payment (the
-- guidance states no design rules of its own for it).
insert into checks select 'content', 'own checklist for every rate except low_sensitivity', 'low_sensitivity',
  coalesce(string_agg(r.code, ', '), ''), coalesce(string_agg(r.code, ', '), '') = 'low_sensitivity'
from rules.ewco_rates r
where not exists (select 1 from rules.payment_items i where i.code = r.code and i.section = 'do');

insert into checks select 'content', 'shared commitments: 15 years and permanently non-agricultural', 'both',
  string_agg(text, ' | '),
  bool_or(text like '%15 years%') and bool_or(text like '%permanently non-agricultural%')
from rules.payment_items where code is null and section = 'commit';

insert into checks select 'content', 'recreational access commits to 30 years', 'true',
  bool_or(text like '%30 years%')::text, bool_or(text like '%30 years%')
from rules.payment_items where code = 'recreational_access' and section = 'commit';

insert into checks select 'content', 'nature recovery has a group name', 'Nature recovery',
  (select name from rules.payment_groups where code = 'nature_recovery'),
  (select name from rules.payment_groups where code = 'nature_recovery') = 'Nature recovery';

-- 2. Results on the standard sites ------------------------------------------
create temporary table sites (id text, g geometry, access boolean);
insert into sites values
  ('1 fine',        st_makeenvelope(511000, 272000, 511300, 272300, 27700), true),
  ('2 sssi',        st_makeenvelope(517904, 270037, 518204, 270337, 27700), true),
  ('4a riparian',   st_makeenvelope(529500, 261500, 529800, 261800, 27700), true),
  ('4b riparian',   st_makeenvelope(529500, 261500, 529800, 261800, 27700), false),
  -- Found by searching the layers: no nature recovery tier touches this square.
  ('6 no nature',   st_makeenvelope(515000, 295000, 515300, 295300, 27700), true);
create temporary table res as select s.id, s.g, public.screen_site(pg_temp.fc(s.g), s.access) j from sites s;

-- payment_details covers exactly the codes in the result.
insert into checks select id, 'payment_details keys = result codes', pg_temp.result_codes(j), pg_temp.detail_codes(j),
  pg_temp.result_codes(j) = pg_temp.detail_codes(j)
from res;

-- Each detail has a benefit, a payment time, a source and at least the 3 shared commitments.
insert into checks select r.id, 'details complete: ' || d.key, 'benefit, paid_when, source, >= 3 commitments, >= 2 to do',
  jsonb_array_length(d.value -> 'commitments') || ' commitments, ' || jsonb_array_length(d.value -> 'what_to_do') || ' to do',
  coalesce(d.value ->> 'benefit', '') <> '' and coalesce(d.value ->> 'paid_when', '') <> ''
  and coalesce(d.value ->> 'source_url', '') <> '' and d.value ->> 'date_checked' = '2026-10-17'
  and jsonb_array_length(d.value -> 'commitments') >= 3 and jsonb_array_length(d.value -> 'what_to_do') >= 2
from res r, jsonb_each(r.j -> 'payment_details') d
where r.id = '4a riparian';

-- Not on this land, checked independently against the layers.
-- Site 1: inside nature recovery, water quality, riparian and low sensitivity
-- (paid); doesn't touch the flood or NfC social layers.
insert into checks select '1 fine', 'not on this land', 'close_to_settlements:outside_area, flood_risk:outside_area, recreational_access:needs_prerequisite',
  pg_temp.not_here(j), pg_temp.not_here(j) = 'close_to_settlements:outside_area, flood_risk:outside_area, recreational_access:needs_prerequisite'
from res where id = '1 fine';
insert into checks select '1 fine', 'layers: flood and NfC social do not touch', 'false / false',
  pg_temp.touches(g, 'ewco_flood_risk') || ' / ' || pg_temp.touches(g, 'ewco_nfc_social'),
  not pg_temp.touches(g, 'ewco_flood_risk') and not pg_temp.touches(g, 'ewco_nfc_social')
from res where id = '1 fine';
insert into checks select '1 fine', 'recreational access names its prerequisite', 'Woodland close to settlements',
  x ->> 'requires_name', x ->> 'requires_name' = 'Woodland close to settlements'
from res, jsonb_array_elements(j -> 'not_on_this_land') x where id = '1 fine' and x ->> 'code' = 'recreational_access';

-- Site 4: everything touches except the whole-site low sensitivity test.
insert into checks select id, 'not on this land', 'low_sensitivity:not_whole_site_inside',
  pg_temp.not_here(j), pg_temp.not_here(j) = 'low_sensitivity:not_whole_site_inside'
from res where id in ('4a riparian', '4b riparian');
insert into checks select '4a riparian', 'layers: square not fully inside low sensitivity v4', 'true',
  coalesce(not st_coveredby(g, u), true)::text, coalesce(not st_coveredby(g, u), true)
from res, lateral (select st_union(f.geom) u from layers.features f
                   where f.layer_id = 'ewco_low_sensitivity_v4' and f.class = 'Low' and st_intersects(f.geom, g)) l
where id = '4a riparian';
-- Access "no": recreational access stays in not_applied (with its details), not "not on this land".
insert into checks select '4b riparian', 'recreational access held back, details present', 'not_applied + details',
  (select string_agg(x ->> 'code', ',') from jsonb_array_elements(j -> 'blocks' -> 0 -> 'not_applied') x)
    || ' / ' || (j -> 'payment_details' ? 'recreational_access')::text,
  (j -> 'blocks' -> 0 -> 'not_applied' -> 0 ->> 'code') = 'recreational_access' and j -> 'payment_details' ? 'recreational_access'
from res where id = '4b riparian';

-- Site 6: nature recovery listed once, as a group of all three tiers.
insert into checks select '6 no nature', 'layers: no nature recovery tier touches', 'false',
  pg_temp.touches(g, 'ewco_priority_habitat_network')::text, not pg_temp.touches(g, 'ewco_priority_habitat_network')
from res where id = '6 no nature';
insert into checks select '6 no nature', 'nature recovery group: once, 3 tiers, £1,100–£3,300',
  '1 entry, nature_recovery_premium,nature_recovery_high,nature_recovery_lower, 1100-3300',
  count(*) || ' entry, ' || string_agg((select string_agg(c, ',') from jsonb_array_elements_text(x -> 'codes') c), ';')
    || ', ' || min(x ->> 'rate_low_gbp') || '-' || max(x ->> 'rate_high_gbp'),
  count(*) = 1
  and min((select string_agg(c, ',') from jsonb_array_elements_text(x -> 'codes') c)) = 'nature_recovery_premium,nature_recovery_high,nature_recovery_lower'
  and min(x ->> 'rate_low_gbp') = '1100' and max(x ->> 'rate_high_gbp') = '3300'
from res, jsonb_array_elements(j -> 'not_on_this_land') x
where id = '6 no nature' and x ->> 'code' like 'nature_recovery%';
insert into checks select '6 no nature', 'no tier listed on its own', '0',
  count(*)::text, count(*) = 0
from res, jsonb_array_elements(j -> 'not_on_this_land') x
where id = '6 no nature' and x ->> 'code' like 'nature_recovery\_%';

-- Nothing plantable: no details, nothing listed as "not on this land".
insert into checks select '2 sssi', 'below minimum: empty not_on_this_land and details', '0 / 0',
  jsonb_array_length(j -> 'not_on_this_land') || ' / ' || (select count(*) from jsonb_object_keys(j -> 'payment_details')),
  jsonb_array_length(j -> 'not_on_this_land') = 0 and j -> 'payment_details' = '{}'::jsonb
from res where id = '2 sssi';

-- 3. "How EWCO pays you" and the compartment rule (D70) -------------------------
insert into checks select '1 fine', 'how_paid lines in order',
  'how_paid_costs,how_paid_upkeep,how_paid_bonuses,how_paid_low_sensitivity,compartment_rule',
  (select string_agg(x ->> 'code', ',') from jsonb_array_elements(j -> 'how_paid') x),
  (select string_agg(x ->> 'code', ',') from jsonb_array_elements(j -> 'how_paid') x)
    = 'how_paid_costs,how_paid_upkeep,how_paid_bonuses,how_paid_low_sensitivity,compartment_rule'
from res where id = '1 fine';
-- The upkeep rate and years come from rules.ewco_rates, not the text.
insert into checks select '1 fine', 'upkeep line filled from the rates table',
  'starts £' || to_char(r.rate_gbp, 'FM999,999') || ' per hectare a year for ' || r.years || ' years',
  left(x ->> 'text', 50),
  (x ->> 'text') like '£' || to_char(r.rate_gbp, 'FM999,999') || ' per hectare a year for ' || r.years || ' years%'
from res, jsonb_array_elements(j -> 'how_paid') x, rules.ewco_rates r
where id = '1 fine' and x ->> 'code' = 'how_paid_upkeep' and r.code = 'maintenance';
insert into checks select 'content', 'how_paid lines have a gov.uk source and date', '0 missing', count(*) || ' missing', count(*) = 0
from rules.messages where kind = 'how_paid'
  and (split_part(source_url, '#', 1) not in (
         'https://www.gov.uk/guidance/england-woodland-creation-offer',
         'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco')
       or date_checked is null);
insert into checks select 'content', 'compartment rule uses the agreed definition', 'present',
  case when text like '%a planting area in your woodland plan, which your Woodland Officer helps you prepare%' then 'present' else 'missing' end,
  text like '%a planting area in your woodland plan, which your Woodland Officer helps you prepare%'
from rules.messages where code = 'compartment_rule';
insert into checks select 'content', 'large-field warning says compartment, not field', 'compartment to touch',
  case when text like '%compartment to touch%' and text not like '%field to touch%' then 'compartment to touch' else text end,
  text like '%compartment to touch%' and text not like '%field to touch%'
from rules.messages where code = 'large_block';
insert into checks select '1 fine', 'how_paid lines are not limitations', '0', count(*)::text, count(*) = 0
from res, jsonb_array_elements_text(j -> 'limitations') l
where id = '1 fine' and l in (select text from rules.messages where kind = 'how_paid');

-- 4. Privileges ------------------------------------------------------------------
insert into checks select 'privileges', 'anon cannot run payment_details_for', 'false',
  has_function_privilege('anon', 'rules.payment_details_for(text[])', 'execute')::text,
  not has_function_privilege('anon', 'rules.payment_details_for(text[])', 'execute');
insert into checks select 'privileges', 'anon cannot read the content tables', 'false',
  (has_table_privilege('anon', 'rules.payment_details', 'select') or has_table_privilege('anon', 'rules.payment_items', 'select'))::text,
  not (has_table_privilege('anon', 'rules.payment_details', 'select') or has_table_privilege('anon', 'rules.payment_items', 'select'));

\echo === Design pass checks: payment details and not on this land ===
select area, check_name, expected, actual, case when ok then 'pass' else 'FAIL' end as status
from checks order by area, check_name;
select count(*) filter (where ok) passed, count(*) filter (where not ok or ok is null) problems from checks;
