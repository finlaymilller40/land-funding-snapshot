-- Design pass: what each payment entails, and bonuses checked but not on this land.
--  * rules.payment_details: per rate code, why the government pays it, when it
--    is paid, and the gov.uk section it comes from (with the date checked).
--  * rules.payment_items: per rate code, a checklist of what you'd have to do
--    and what you're committing to. Rows with a null code apply to every
--    payment. Each row has its own gov.uk section and date checked.
--  * rules.payment_groups: display names for exclusive groups (nature recovery).
--  * screen_site(): returns `payment_details` for every code in the result and
--    `not_on_this_land` for map-based bonuses checked but not applying.
--
-- Wording is written only from these two pages, re-checked on 2026-10-17:
--   G = https://www.gov.uk/guidance/england-woodland-creation-offer (updated 11 Aug 2026)
--   A = https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco (updated 5 Oct 2026)
-- Nothing is added that those pages don't state.

create table rules.payment_groups (
  code text primary key,                 -- matches rules.ewco_rates.exclusive_group
  name text not null
);

create table rules.payment_details (
  code text primary key references rules.ewco_rates (code),
  benefit text not null,                 -- "Why the government pays it": one sentence
  paid_when text not null,               -- "When it's paid"
  source_section text not null,          -- the gov.uk section heading
  source_url text not null,              -- link to that section
  date_checked date not null
);

create table rules.payment_items (
  id int generated always as identity primary key,
  code text references rules.ewco_rates (code),   -- null = applies to every payment
  section text not null check (section in ('do', 'commit')),
  sort int not null,
  text text not null,
  source_section text not null,
  source_url text not null,
  date_checked date not null,
  unique nulls not distinct (code, section, sort)
);

alter table rules.payment_groups enable row level security;
alter table rules.payment_details enable row level security;
alter table rules.payment_items enable row level security;

insert into rules.payment_groups (code, name) values ('nature_recovery', 'Nature recovery');

-- Why it's paid, and when -----------------------------------------------------
insert into rules.payment_details (code, benefit, paid_when, source_section, source_url, date_checked) values
  ('nature_recovery_premium',
   'New native woodland here expands existing ancient woodland, helping nature and wildlife recover.',
   'Once, with your final planting claim, when the Forestry Commission is satisfied all the planting work is done.',
   'Additional contributions: 1. Nature recovery',
   'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#nature-recovery', '2026-10-17'),
  ('nature_recovery_high',
   'New native woodland here expands existing native woodland, helping nature and wildlife recover.',
   'Once, with your final planting claim, when the Forestry Commission is satisfied all the planting work is done.',
   'Additional contributions: 1. Nature recovery',
   'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#nature-recovery', '2026-10-17'),
  ('nature_recovery_lower',
   'New native woodland here creates new areas of native woodland, helping nature and wildlife recover.',
   'Once, with your final planting claim, when the Forestry Commission is satisfied all the planting work is done.',
   'Additional contributions: 1. Nature recovery',
   'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#nature-recovery', '2026-10-17'),
  ('flood_risk',
   'Trees help rain soak into the soil and hold more water, which helps reduce the risk of flooding.',
   'Once, with your final planting claim, when the Forestry Commission is satisfied all the planting work is done.',
   'Additional contributions: 3. Flood risk management',
   'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#flood-risk-management', '2026-10-17'),
  ('water_quality',
   'Woodland cuts fertiliser and pesticide use and catches soil and pollutants in run-off before they reach rivers.',
   'Once, with your final planting claim, when the Forestry Commission is satisfied all the planting work is done.',
   'Additional contributions: 2. Water quality',
   'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#water-quality', '2026-10-17'),
  ('riparian',
   'Riverside trees shade and cool the water for fish and other river life, catch pollutants in run-off and protect the banks.',
   'Once, with your final planting claim, when the Forestry Commission is satisfied all the planting work is done.',
   'Additional contributions: 4. Riparian buffers',
   'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#Riparian', '2026-10-17'),
  ('close_to_settlements',
   'Woodland close to where people live brings social and environmental benefits to the people nearby.',
   'Once, with your final planting claim, when the Forestry Commission is satisfied all the planting work is done.',
   'Additional contributions: 5. Close to settlements',
   'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#close-to-settlements', '2026-10-17'),
  ('recreational_access',
   'It opens new woodland to the public on foot, close to where people live.',
   'Once, with your final planting claim. The signs or maps advertising access must be agreed and in place before you claim.',
   'Additional contributions: 6. Recreational access',
   'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#recreational-access', '2026-10-17'),
  ('low_sensitivity',
   'It encourages new woodland on land where there are likely to be fewer sensitivities or constraints to planting.',
   'Once, automatically, after you have finished and claimed for all other work.',
   'EWCO guidance: 7.5 Low sensitivity land payment',
   'https://www.gov.uk/guidance/england-woodland-creation-offer#low-sensitivity-land-payment', '2026-10-17'),
  ('maintenance',
   'It helps the young trees establish and pays for the ongoing upkeep of the woodland.',
   'Each autumn for 15 years. The first 5 years are paid automatically once all planting items are claimed; you claim again in years 6 and 11. Send your final planting claim by 31 August for payments to start that autumn.',
   'EWCO guidance: 7.2 Annual maintenance payments',
   'https://www.gov.uk/guidance/england-woodland-creation-offer#annual-maintenance-payments', '2026-10-17'),
  ('planting_costs',
   'It pays back the standard costs of creating the new woodland, up to a cap.',
   'As you claim for finished work, at least £5,000 per claim, over the 3 years of your agreement. You can only claim for work once it is done satisfactorily.',
   'EWCO guidance: 7.1 Standard cost items and activities',
   'https://www.gov.uk/guidance/england-woodland-creation-offer#standard-cost-items-and-activities', '2026-10-17');

-- What you'd have to do, and what you're committing to -----------------------
-- Shared by every payment (code null).
insert into rules.payment_items (code, section, sort, text, source_section, source_url, date_checked) values
  (null, 'do', 1, 'Plant and manage the woodland to the UK Forestry Standard.',
   'EWCO guidance: introduction', 'https://www.gov.uk/guidance/england-woodland-creation-offer', '2026-10-17'),
  (null, 'do', 2, 'Keep the woodland at least 20 m wide on average (10 m for riverside buffers and shelterbelts).',
   'EWCO guidance: 4. What land is eligible', 'https://www.gov.uk/guidance/england-woodland-creation-offer#what-land-is-eligible', '2026-10-17'),
  (null, 'commit', 1, 'Look after the woodland for 15 years after your final planting payment.',
   'EWCO guidance: 7.2 Annual maintenance payments', 'https://www.gov.uk/guidance/england-woodland-creation-offer#annual-maintenance-payments', '2026-10-17'),
  (null, 'commit', 2, 'The land stops being farmland for good: you register it with the Rural Payments Agency as permanently non-agricultural from 1 January of the year after your agreement starts.',
   'EWCO guidance: 4.2 Restrictions on agricultural activity', 'https://www.gov.uk/guidance/england-woodland-creation-offer#restrictions-on-agricultural-activity', '2026-10-17'),
  (null, 'commit', 3, 'Keep management control of the land for the whole agreement.',
   'EWCO guidance: 4. What land is eligible', 'https://www.gov.uk/guidance/england-woodland-creation-offer#what-land-is-eligible', '2026-10-17');

-- Nature recovery: the same design rules for all three tiers (A 1.1).
insert into rules.payment_items (code, section, sort, text, source_section, source_url, date_checked)
select t.code, 'do', i.sort, i.text, 'Additional contributions: 1.1 Ancient woodland and native woodland',
       'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#ancient-woodland-and-native-woodland',
       '2026-10-17'
from (values ('nature_recovery_premium'), ('nature_recovery_high'), ('nature_recovery_lower')) t(code)
cross join (values
  (1, 'At least 80% native species in total.'),
  (2, 'At least 5 native species, with no more than 50% of any one.'),
  (3, '25 to 35% small trees and woody shrubs from the list in the application form.'),
  (4, 'At least 1,600 stems per hectare (lower can be agreed at woodland edges).'),
  (5, 'Open space of at least 10% on blocks up to 5 ha, or at least 20% on larger blocks (up to 40% with your Woodland Officer''s agreement).'),
  (6, 'Show how the woodland will be laid out on the ground and how young trees will be cared for.')
) i(sort, text);

insert into rules.payment_items (code, section, sort, text, source_section, source_url, date_checked) values
  -- Water quality (A 2.2–2.4)
  ('water_quality', 'do', 1, 'No more than 50% of any one species.',
   'Additional contributions: 2.2 Species mix', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#species-mix-2', '2026-10-17'),
  ('water_quality', 'do', 2, 'No more than 35% small trees and woody shrubs.',
   'Additional contributions: 2.2 Species mix', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#species-mix-2', '2026-10-17'),
  ('water_quality', 'do', 3, 'At least 1,100 stems per hectare, planted closer across run-off paths.',
   'Additional contributions: 2.3 Stocking density', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#stocking-density-2', '2026-10-17'),
  ('water_quality', 'do', 4, 'Open space of no more than 20%.',
   'Additional contributions: 2.3 Stocking density', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#stocking-density-2', '2026-10-17'),
  ('water_quality', 'do', 5, 'Line up field drains so water drains slowly into buffer areas, not straight into watercourses.',
   'Additional contributions: 2.4 Ground preparation', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#ground-preparation', '2026-10-17'),

  -- Flood risk management (A 3.2–3.4)
  ('flood_risk', 'do', 1, 'No more than 50% of any one species.',
   'Additional contributions: 3.2 Species mix', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#species-mix-3', '2026-10-17'),
  ('flood_risk', 'do', 2, 'No more than 35% small trees and woody shrubs.',
   'Additional contributions: 3.2 Species mix', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#species-mix-3', '2026-10-17'),
  ('flood_risk', 'do', 3, 'At least 1,100 stems per hectare, rising to up to 2,500 in the lowest, wettest parts of the floodplain.',
   'Additional contributions: 3.3 Stocking density', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#stocking-density-3', '2026-10-17'),
  ('flood_risk', 'do', 4, 'Open space of no more than 20% in the floodplain.',
   'Additional contributions: 3.3 Stocking density', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#stocking-density-3', '2026-10-17'),
  ('flood_risk', 'do', 5, 'No new drains or ditches, and no work that increases drainage into a watercourse.',
   'Additional contributions: 3.4 Ground preparation', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#ground-preparation-1', '2026-10-17'),

  -- Riparian buffers (A 4.1–4.4)
  ('riparian', 'do', 1, 'Plant within 10 m of the bank of the targeted watercourse.',
   'Additional contributions: 4.1 Spatial targeting', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#spatial-targeting-4', '2026-10-17'),
  ('riparian', 'do', 2, 'Map the riverside part as its own compartment.',
   'Additional contributions: 4.1 Spatial targeting', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#spatial-targeting-4', '2026-10-17'),
  ('riparian', 'do', 3, 'Only native trees and shrubs suited to riverside woodland.',
   'Additional contributions: 4.2 Species mix', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#species-mix-4', '2026-10-17'),
  ('riparian', 'do', 4, 'No more than 35% small trees and woody shrubs.',
   'Additional contributions: 4.2 Species mix', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#species-mix-4', '2026-10-17'),
  ('riparian', 'do', 5, 'No more than 1,100 stems per hectare, with 40% open space.',
   'Additional contributions: 4.3 Stocking density', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#stocking-density-4', '2026-10-17'),
  ('riparian', 'do', 6, 'Shade at least 50% of the watercourse next to your land.',
   'Additional contributions: 4.3 Stocking density', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#stocking-density-4', '2026-10-17'),
  ('riparian', 'do', 7, 'No new ditches or sub-soil drains, and no work that increases flow into the watercourse.',
   'Additional contributions: 4.4 Ground preparation', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#ground-preparation-2', '2026-10-17'),

  -- Close to settlements (A 5.2–5.3)
  ('close_to_settlements', 'do', 1, 'No more than 50% of any one species.',
   'Additional contributions: 5.2 Species mix', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#species-mix-5', '2026-10-17'),
  ('close_to_settlements', 'do', 2, 'No more than 35% woody shrubs and small trees.',
   'Additional contributions: 5.2 Species mix', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#species-mix-5', '2026-10-17'),
  ('close_to_settlements', 'do', 3, 'At least 1,100 stems per hectare.',
   'Additional contributions: 5.3 Stocking density', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#stocking-density-5', '2026-10-17'),

  -- Recreational access (A 6, 6.2, 6.4)
  ('recreational_access', 'do', 1, 'Meet the close-to-settlements design rules too.',
   'Additional contributions: 6. Recreational access', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#recreational-access', '2026-10-17'),
  ('recreational_access', 'do', 2, 'Open the whole compartment to the public on foot, with a path network.',
   'Additional contributions: 6. Recreational access', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#recreational-access', '2026-10-17'),
  ('recreational_access', 'do', 3, 'Only on land with no existing public access, and not open access (CRoW) land.',
   'Additional contributions: 6. Recreational access', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#recreational-access', '2026-10-17'),
  ('recreational_access', 'do', 4, 'Allow access in daylight all year; you can close for maintenance up to 10 days a year.',
   'Additional contributions: 6. Recreational access', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#recreational-access', '2026-10-17'),
  ('recreational_access', 'do', 5, 'Send an access map showing the new routes and where signs will go.',
   'Additional contributions: 6.2 When applying', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#when-applying', '2026-10-17'),
  ('recreational_access', 'do', 6, 'Advertise the access with waymarkers, signs or online maps, showing any maintenance closure dates.',
   'Additional contributions: 6.4 If you''re successful', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#if-youre-successful', '2026-10-17'),
  ('recreational_access', 'commit', 1, 'Keep public access on foot open for at least 30 years.',
   'Additional contributions: 6. Recreational access', 'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco#recreational-access', '2026-10-17'),

  -- Low sensitivity land payment (G 7.5): no design rules of its own are stated.

  -- Annual maintenance (G 7.2)
  ('maintenance', 'do', 1, 'Say in your application that you want maintenance payments.',
   'EWCO guidance: 7.2 Annual maintenance payments', 'https://www.gov.uk/guidance/england-woodland-creation-offer#annual-maintenance-payments', '2026-10-17'),
  ('maintenance', 'do', 2, 'Look after the woodland and any capital items.',
   'EWCO guidance: 7.2 Annual maintenance payments', 'https://www.gov.uk/guidance/england-woodland-creation-offer#annual-maintenance-payments', '2026-10-17'),

  -- Planting and capital costs (G 7.1)
  ('planting_costs', 'do', 1, 'Choose the work you need from the standard cost list in your application.',
   'EWCO guidance: 7.1 Standard cost items and activities', 'https://www.gov.uk/guidance/england-woodland-creation-offer#standard-cost-items-and-activities', '2026-10-17'),
  ('planting_costs', 'do', 2, 'Only start work once your agreement is in place.',
   'EWCO guidance: 7.1 Standard cost items and activities', 'https://www.gov.uk/guidance/england-woodland-creation-offer#standard-cost-items-and-activities', '2026-10-17'),
  ('planting_costs', 'do', 3, 'Finish all the work within 3 years of your agreement starting.',
   'EWCO guidance: 7.1 Standard cost items and activities', 'https://www.gov.uk/guidance/england-woodland-creation-offer#standard-cost-items-and-activities', '2026-10-17'),
  ('planting_costs', 'commit', 1, 'If the work costs more than the cap, you must still complete everything in your agreement.',
   'EWCO guidance: 7.1.2 Standard cost payments cap', 'https://www.gov.uk/guidance/england-woodland-creation-offer#standard-cost-items-and-activities', '2026-10-17');

-- Details and checklist for a set of rate codes, keyed by code. Each item
-- carries its own source. Shared items (null code) come after the payment's own.
create function rules.payment_details_for(codes text[])
returns jsonb
language sql
stable
set search_path = rules, pg_temp
as $$
  select coalesce(jsonb_object_agg(d.code, jsonb_build_object(
           'benefit', d.benefit,
           'paid_when', d.paid_when,
           'source_section', d.source_section,
           'source_url', d.source_url,
           'date_checked', d.date_checked,
           'what_to_do', (select coalesce(jsonb_agg(jsonb_build_object(
                             'text', i.text, 'source_section', i.source_section, 'source_url', i.source_url)
                             order by (i.code is null), i.sort), '[]')
                          from rules.payment_items i
                          where i.section = 'do' and (i.code = d.code or i.code is null)),
           'commitments', (select coalesce(jsonb_agg(jsonb_build_object(
                             'text', i.text, 'source_section', i.source_section, 'source_url', i.source_url)
                             order by (i.code is null), i.sort), '[]')
                           from rules.payment_items i
                           where i.section = 'commit' and (i.code = d.code or i.code is null)))), '{}')
  from rules.payment_details d
  where d.code = any (codes);
$$;

revoke all on function rules.payment_details_for(text[]) from public, anon, authenticated;

-- screen_site -----------------------------------------------------------------
-- As in 20261016115544, plus payment_details and not_on_this_land.
create or replace function public.screen_site(site jsonb, public_access boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = extensions, rules, layers, pg_temp
as $$
declare
  min_site_ha numeric := rules.setting('min_site_eligible_ha');
  min_block_ha numeric := rules.setting('min_block_eligible_ha');
  tol_pct numeric := rules.setting('low_sensitivity_tolerance_pct');
  tol_m2 numeric := rules.setting('low_sensitivity_tolerance_m2');
  large_ha numeric := rules.setting('large_block_ha');

  n int;
  i int;
  names text[];
  drawn extensions.geometry[];
  elig extensions.geometry[] := '{}';
  block_ok boolean[] := '{}';
  removed_out jsonb[] := '{}';
  removed_shapes jsonb[] := '{}';
  shapes jsonb;
  cut extensions.geometry;
  flags_out jsonb[] := '{}';

  remaining extensions.geometry;
  cover extensions.geometry;
  inside extensions.geometry;
  a double precision;
  ex record;
  fl record;
  r record;
  removed jsonb;
  flags jsonb;

  drawn_union extensions.geometry;
  eligible_union extensions.geometry;
  site_eligible_m2 double precision := 0;
  site_ok boolean;
  lsm_ok boolean := false;
  lsm_outside_m2 double precision;
  lsm_rate record;

  payments jsonb;
  costs jsonb;
  not_applied jsonb;
  paid_codes text[];
  paid_groups text[];
  pay_m2 double precision;
  inside_m2 double precision;
  pay_amount numeric;
  pay_low numeric;
  any_large boolean := false;
  shape_tol numeric;
  blocks_out jsonb := '[]';
  site_flags jsonb := '[]';
  one_off jsonb;
  one_off_total numeric;
  one_off_low numeric;
  maint jsonb;
  costs_total jsonb;
  paid_all text[] := '{}';
  skipped_all text[] := '{}';
  groups_done text[] := '{}';
  not_here jsonb := '[]';
  result_codes text[];
begin
  -- Missing settings would make comparisons null and silently pass. Fail closed.
  if min_site_ha is null or min_block_ha is null or tol_pct is null or tol_m2 is null or large_ha is null then
    raise exception 'screen_site: rules.settings is incomplete';
  end if;

  select array_agg(p.name order by p.idx), array_agg(p.geom order by p.idx)
    into names, drawn
  from rules.parse_site(site) p;
  n := array_length(drawn, 1);
  drawn_union := (select st_union(d) from unnest(drawn) d);

  -- Eligibility per block ------------------------------------------------------
  for i in 1..n loop
    remaining := drawn[i];
    removed := '[]';
    shapes := '[]';
    -- Result shapes: 1 m for normal fields, coarser for very large blocks
    -- (about 3.4 m for 1,150 ha), which keeps big responses fast and small.
    shape_tol := greatest(rules.setting('result_simplify_m'), (sqrt(st_area(drawn[i])) / 1000)::numeric);
    for ex in select * from rules.ewco_exclusions order by priority loop
      cover := rules.layer_near(remaining, ex.layer_id, ex.qualifying_classes, ex.buffer_m);
      continue when cover is null;
      cut := st_collectionextract(st_intersection(remaining, cover), 3);
      a := st_area(cut);
      continue when a < 1;  -- ignore sub-square-metre slivers
      shapes := shapes || jsonb_build_object(
        'type', 'Feature',
        'properties', jsonb_build_object('code', ex.code, 'reason', ex.label),
        'geometry', rules.to_geojson(cut, shape_tol));
      removed := removed || jsonb_build_object(
        'code', ex.code, 'reason', ex.label, 'ha', round((a / 1e4)::numeric, 2),
        'explanation', ex.explanation);
      remaining := st_collectionextract(st_difference(remaining, cover), 3);
    end loop;

    flags := '[]';
    for fl in select * from rules.ewco_flags order by code loop
      cover := rules.layer_near(remaining, fl.layer_id, fl.qualifying_classes);
      continue when cover is null;
      a := st_area(st_intersection(remaining, cover));
      continue when a < 1;
      flags := flags || jsonb_build_object(
        'code', fl.code, 'label', fl.label, 'ha', round((a / 1e4)::numeric, 2),
        'explanation', fl.explanation);
    end loop;
    if st_area(drawn[i]) / 1e4 > large_ha then
      any_large := true;
      flags := flags || jsonb_build_object(
        'code', 'large_block', 'label', 'Very large field',
        'explanation', format((select text from rules.messages where code = 'large_block'), large_ha));
    end if;

    elig := elig || remaining;
    block_ok := block_ok || (st_area(remaining) / 1e4 >= min_block_ha);
    removed_out := removed_out || removed;
    removed_shapes := removed_shapes || shapes;
    flags_out := flags_out || flags;
    if block_ok[i] then site_eligible_m2 := site_eligible_m2 + st_area(remaining); end if;
  end loop;

  site_ok := site_eligible_m2 / 1e4 >= min_site_ha;

  -- Low sensitivity: whole eligible proposal inside the map (with tolerance) ---
  select * into lsm_rate from rules.ewco_rates where qualification = 'whole_site_inside' limit 1;
  -- Test a field, not the record: a record is only "not null" if every field is.
  if site_ok and lsm_rate.code is not null then
    eligible_union := (select st_union(e) from unnest(elig, block_ok) as t(e, ok) where ok);
    cover := rules.layer_near(eligible_union, lsm_rate.layer_id, lsm_rate.qualifying_classes);
    lsm_outside_m2 := case when cover is null then st_area(eligible_union)
                           else st_area(st_difference(eligible_union, cover)) end;
    lsm_ok := lsm_outside_m2 <= least(st_area(eligible_union) * tol_pct / 100, tol_m2);
  end if;

  -- Payments per block -----------------------------------------------------
  for i in 1..n loop
    shape_tol := greatest(rules.setting('result_simplify_m'), (sqrt(st_area(drawn[i])) / 1000)::numeric);
    payments := '[]';
    costs := '[]';
    not_applied := '[]';
    paid_codes := '{}';
    paid_groups := '{}';

    if site_ok and block_ok[i] then
      -- Prerequisites first, then highest rate first (so a group keeps its top tier).
      for r in select * from rules.ewco_rates
               order by (requires_code is not null), rate_gbp desc, code loop
        pay_m2 := null;
        inside := null;
        if r.qualification = 'eligible_area' then
          pay_m2 := st_area(elig[i]);
        elsif r.exclusive_group is not null and r.exclusive_group = any (paid_groups) then
          continue;
        else
          -- Every map-based payment: the part of the plantable land inside the target area.
          cover := rules.layer_near(elig[i], r.layer_id, r.qualifying_classes);
          if cover is not null then
            inside := st_collectionextract(st_intersection(elig[i], cover), 3);
          end if;
          if r.qualification = 'whole_site_inside' then
            if lsm_ok then pay_m2 := st_area(elig[i]); end if;
          elsif r.qualification = 'touches' then
            if rules.layer_touches(elig[i], r.layer_id, r.qualifying_classes) then
              pay_m2 := st_area(elig[i]);
            end if;
          elsif r.qualification = 'area_inside' then
            if inside is not null then pay_m2 := st_area(inside); end if;
          end if;
        end if;
        continue when pay_m2 is null or pay_m2 < 1;

        -- Low estimate: paid only on the land actually inside the target area.
        inside_m2 := case when r.qualification = 'eligible_area' then pay_m2
                          else least(coalesce(st_area(inside), 0), pay_m2) end;
        pay_amount := round(r.rate_gbp * pay_m2 / 1e4);
        pay_low := round(r.rate_gbp * inside_m2 / 1e4);

        if r.requires_code is not null and not (r.requires_code = any (paid_codes)) then
          continue;
        end if;
        if r.requires_public_access and not coalesce(public_access, false) then
          not_applied := not_applied || jsonb_build_object(
            'code', r.code, 'payment', r.payment_name,
            'reason', 'You answered no to offering public access for 30 years.',
            'would_be_gbp', pay_amount,
            'would_be_low_gbp', pay_low);
          continue;
        end if;

        paid_codes := paid_codes || r.code;
        if r.exclusive_group is not null then paid_groups := paid_groups || r.exclusive_group; end if;

        if r.kind = 'costs_covered' then
          costs := costs || jsonb_build_object(
            'code', r.code, 'name', r.payment_name, 'rate_gbp', r.rate_gbp, 'unit', r.unit,
            'ha', round((pay_m2 / 1e4)::numeric, 2), 'up_to_gbp', pay_amount,
            'condition', r.design_condition);
        else
          payments := payments || jsonb_build_object(
            'code', r.code, 'name', r.payment_name, 'kind', r.kind,
            'rate_gbp', r.rate_gbp, 'unit', r.unit,
            'qualification', r.qualification,
            'layer_id', r.layer_id,
            'basis', case r.qualification
                       when 'touches' then 'whole eligible block (block touches the target area)'
                       when 'area_inside' then 'only the part of the block inside the target area'
                       when 'whole_site_inside' then 'whole eligible block (entire proposal inside the map)'
                       else 'whole eligible block' end,
            'ha', round((pay_m2 / 1e4)::numeric, 2),
            'inside_ha', round((inside_m2 / 1e4)::numeric, 2),
            'inside_pct', round((100 * inside_m2 / nullif(st_area(elig[i]), 0))::numeric),
            'amount_gbp', pay_amount,
            'low_amount_gbp', pay_low,
            'years', r.years,
            'total_gbp', pay_amount * coalesce(r.years, 1),
            'condition', r.design_condition,
            -- Omitted when (almost) the whole field qualifies: the map then
            -- uses the field's eligible shape instead of a duplicate.
            'qualifying_is_whole_field', inside_m2 >= st_area(elig[i]) * 0.995,
            'qualifying_geometry', case when inside is null or st_isempty(inside)
                                             or inside_m2 >= st_area(elig[i]) * 0.995 then null
                                        else rules.to_geojson(inside, shape_tol) end);
        end if;
      end loop;
    end if;

    blocks_out := blocks_out || jsonb_build_object(
      'block', i,
      'name', names[i],
      'drawn_ha', round((st_area(drawn[i]) / 1e4)::numeric, 2),
      'removed', removed_out[i],
      'removed_ha', round(((st_area(drawn[i]) - st_area(elig[i])) / 1e4)::numeric, 2),
      'eligible_ha', round((st_area(elig[i]) / 1e4)::numeric, 2),
      'meets_block_minimum', block_ok[i],
      'is_large', st_area(drawn[i]) / 1e4 > large_ha,
      'flags', flags_out[i] || case when block_ok[i] then '[]'::jsonb else jsonb_build_array(
                 jsonb_build_object('code', 'block_below_minimum', 'explanation',
                   (select text from rules.messages where code = 'block_below_minimum'))) end,
      'payments', payments,
      'costs_covered', costs,
      'not_applied', not_applied,
      'geometry', jsonb_build_object(
        'eligible', case when st_isempty(elig[i]) then null
                         else rules.to_geojson(elig[i], shape_tol) end,
        'removed', removed_shapes[i]));
  end loop;

  if not site_ok then
    site_flags := site_flags || jsonb_build_object('code', 'site_below_minimum', 'explanation',
      (select text from rules.messages where code = 'site_below_minimum'));
  end if;

  -- Totals -------------------------------------------------------------------
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'ha', ha, 'inside_ha', inside_ha,
                                               'amount_gbp', amount, 'low_amount_gbp', low)
                            order by amount desc, code), '[]'),
         coalesce(sum(amount), 0),
         coalesce(sum(low), 0)
    into one_off, one_off_total, one_off_low
  from (
    select p ->> 'code' code, p ->> 'name' name,
           sum((p ->> 'ha')::numeric) ha, sum((p ->> 'inside_ha')::numeric) inside_ha,
           sum((p ->> 'amount_gbp')::numeric) amount, sum((p ->> 'low_amount_gbp')::numeric) low
    from jsonb_array_elements(blocks_out) b, jsonb_array_elements(b -> 'payments') p
    where p ->> 'kind' = 'one_off'
    group by 1, 2
  ) t;

  select jsonb_build_object(
           'ha', coalesce(sum((p ->> 'ha')::numeric), 0),
           'per_year_gbp', coalesce(sum((p ->> 'amount_gbp')::numeric), 0),
           'years', max((p ->> 'years')::int),
           'total_gbp', coalesce(sum((p ->> 'total_gbp')::numeric), 0))
    into maint
  from jsonb_array_elements(blocks_out) b, jsonb_array_elements(b -> 'payments') p
  where p ->> 'kind' = 'annual';

  select jsonb_build_object(
           'planting_costs_up_to_gbp', coalesce(sum((c ->> 'up_to_gbp')::numeric), 0),
           'ha', coalesce(sum((c ->> 'ha')::numeric), 0),
           'rate_gbp_per_ha', (select rate_gbp from rules.ewco_rates where code = 'planting_costs'),
           'condition', (select design_condition from rules.ewco_rates where code = 'planting_costs'))
    into costs_total
  from jsonb_array_elements(blocks_out) b, jsonb_array_elements(b -> 'costs_covered') c;

  -- Map-based bonuses checked but not on this land ----------------------------
  -- Only when the site meets the minimum (otherwise nothing is paid at all).
  -- A payment counts as on this land if any block is paid it, or would be
  -- paid it but for the public-access answer (that is reported in not_applied).
  select coalesce(array_agg(distinct p ->> 'code'), '{}') into paid_all
  from jsonb_array_elements(blocks_out) b,
       jsonb_array_elements((b -> 'payments') || (b -> 'costs_covered')) p;
  select coalesce(array_agg(distinct x ->> 'code'), '{}') into skipped_all
  from jsonb_array_elements(blocks_out) b, jsonb_array_elements(b -> 'not_applied') x;

  if site_ok then
    for r in select * from rules.ewco_rates
             where layer_id is not null
             order by rate_gbp desc, code loop
      continue when r.code = any (paid_all) or r.code = any (skipped_all);
      if r.exclusive_group is not null then
        -- A group (the nature recovery tiers) is listed once, and only if no tier applies.
        continue when r.exclusive_group = any (groups_done);
        groups_done := groups_done || r.exclusive_group;
        continue when exists (select 1 from rules.ewco_rates g
                              where g.exclusive_group = r.exclusive_group and g.code = any (paid_all || skipped_all));
        not_here := not_here || (
          select jsonb_build_object(
                   'code', r.exclusive_group,
                   'name', coalesce((select pg.name from rules.payment_groups pg where pg.code = r.exclusive_group),
                                    r.payment_name),
                   'codes', jsonb_agg(g.code order by g.rate_gbp desc),
                   'rate_low_gbp', min(g.rate_gbp),
                   'rate_high_gbp', max(g.rate_gbp),
                   'unit', r.unit,
                   'layer_id', r.layer_id,
                   'reason', 'outside_area')
          from rules.ewco_rates g where g.exclusive_group = r.exclusive_group);
      else
        not_here := not_here || jsonb_build_object(
          'code', r.code,
          'name', r.payment_name,
          'codes', jsonb_build_array(r.code),
          'rate_low_gbp', r.rate_gbp,
          'rate_high_gbp', r.rate_gbp,
          'unit', r.unit,
          'layer_id', r.layer_id,
          'reason', case
                      when r.requires_code is not null and not (r.requires_code = any (paid_all)) then 'needs_prerequisite'
                      when r.qualification = 'whole_site_inside' then 'not_whole_site_inside'
                      else 'outside_area' end,
          'requires_code', r.requires_code,
          'requires_name', (select q.payment_name from rules.ewco_rates q where q.code = r.requires_code));
      end if;
    end loop;
  end if;

  result_codes := paid_all || skipped_all;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'blocks', n,
      'drawn_ha', round((st_area(drawn_union) / 1e4)::numeric, 2),
      'eligible_ha', round((site_eligible_m2 / 1e4)::numeric, 2),
      'meets_site_minimum', site_ok,
      'public_access', coalesce(public_access, false),
      'low_sensitivity_whole_site', lsm_ok,
      'has_large_block', any_large,
      'large_block_ha', large_ha),
    'income', jsonb_build_object(
      'one_off', one_off,
      'one_off_total_gbp', one_off_total,
      'one_off_low_gbp', one_off_low,
      'annual_maintenance', maint,
      'total_income_gbp', one_off_total + coalesce((maint ->> 'total_gbp')::numeric, 0),
      'total_income_low_gbp', one_off_low + coalesce((maint ->> 'total_gbp')::numeric, 0)),
    'costs_covered', costs_total,
    'blocks', blocks_out,
    'not_on_this_land', not_here,
    'payment_details', rules.payment_details_for(result_codes),
    'site_flags', site_flags,
    'next_steps', (select coalesce(jsonb_agg(jsonb_build_object(
                     'code', g.code, 'title', g.title, 'body', g.body, 'source_url', g.source_url)
                     order by g.sort), '[]')
                   from rules.guidance_steps g
                   where g.min_site_ha is null or site_eligible_m2 / 1e4 >= g.min_site_ha),
    'limitations', (select jsonb_agg(text order by sort) from rules.messages where kind = 'limitation'),
    'rates_checked', (select max(date_checked) from rules.ewco_rates),
    'sources', (select jsonb_agg(distinct src) from (
                  select source_url src from rules.ewco_rates
                  union select source_url from rules.guidance_steps) s)
  );
end;
$$;

revoke all on function public.screen_site(jsonb, boolean) from public;
grant execute on function public.screen_site(jsonb, boolean) to anon, authenticated;
