-- Open water as a seventh screening exclusion (D69).
-- Layer `open_water`: Natural England's Living England 2022-23 habitat map,
-- class "Water" (same dataset and zones as developed_land), loaded by
-- scripts/load_layers.ts from config/layers.json. Removed last, so water
-- inside an SSSI, priority habitat and so on stays credited to that reason.
-- The EWCO pages don't list water as ineligible, so like SSSIs it is a
-- screening exclusion, and the screening_exclusions limitation now says so.

insert into rules.ewco_exclusions
  (code, label, layer_id, qualifying_classes, buffer_m, priority, explanation, source_url, date_checked)
values
  ('open_water', 'Open water', 'open_water', '{"Water"}', 0, 7,
   'Rivers, lakes, ponds and other open water can''t be planted with new woodland.',
   null, '2026-10-19');

update rules.messages set text =
  'SSSIs, priority habitat, Scheduled Monuments, deep peat and open water are removed as screening exclusions based on wider woodland creation rules; the EWCO pages do not list them as ineligible.'
where code = 'screening_exclusions';

insert into rules.messages (code, kind, sort, text) values
  ('open_water_edges', 'limitation', 12,
   'Open water is removed using Natural England''s Living England habitat map, which is mapped from satellite images at about 10 m. The edges of rivers, lakes and ponds are approximate, and narrow ditches and drains may not be removed.');
