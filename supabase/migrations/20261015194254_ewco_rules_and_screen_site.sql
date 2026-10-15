-- Phase 2: EWCO rules engine.
-- Rates, exclusions, flags, settings and wording live in tables in the private
-- `rules` schema. public.screen_site() is the only thing the website can call:
-- it reads the private layers and returns results, never the layers themselves.

create schema rules;
revoke all on schema rules from public, anon, authenticated;

-- Numbers the engine uses that are not payment rates.
create table rules.settings (
  key text primary key,
  value numeric not null,
  unit text not null,
  note text not null,
  source_url text
);

-- Payments and costs. One row per payment (each nature recovery tier is a row).
create table rules.ewco_rates (
  code text primary key,
  payment_name text not null,
  kind text not null check (kind in ('one_off', 'annual', 'costs_covered')),
  rate_gbp numeric not null check (rate_gbp >= 0),
  unit text not null,
  years int,
  layer_id text,                      -- layers.sources id (filled by the loader, so no FK)
  qualifying_classes text[],          -- null = any feature in the layer
  qualification text not null
    check (qualification in ('touches', 'area_inside', 'whole_site_inside', 'eligible_area')),
  exclusive_group text,               -- only the highest-rate row in a group applies
  requires_public_access boolean not null default false,
  requires_code text references rules.ewco_rates (code),
  design_condition text not null,     -- "Only if your design meets ..."
  source_url text not null,
  date_checked date not null
);

-- Areas removed from a block before anything is paid, in priority order.
-- Each square metre is credited to the first reason that covers it.
create table rules.ewco_exclusions (
  code text primary key,
  label text not null,
  layer_id text not null,             -- layers.sources id
  qualifying_classes text[],
  buffer_m numeric not null default 0,
  priority int not null unique,
  explanation text not null,
  source_url text,
  date_checked date not null
);

-- Things worth knowing about the eligible area that do not remove it.
create table rules.ewco_flags (
  code text primary key,
  label text not null,
  layer_id text not null,             -- layers.sources id
  qualifying_classes text[],
  explanation text not null
);

-- Site-level messages and known limitations.
create table rules.messages (
  code text primary key,
  kind text not null check (kind in ('flag', 'limitation')),
  sort int not null,
  text text not null
);

alter table rules.settings enable row level security;
alter table rules.ewco_rates enable row level security;
alter table rules.ewco_exclusions enable row level security;
alter table rules.ewco_flags enable row level security;
alter table rules.messages enable row level security;

-- ---------------------------------------------------------------------------
-- Data. Checked against gov.uk on 2026-10-15:
--   G = https://www.gov.uk/guidance/england-woodland-creation-offer (updated 11 Aug 2026)
--   A = https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco (updated 5 Oct 2026)
-- ---------------------------------------------------------------------------

insert into rules.settings (key, value, unit, note, source_url) values
  ('min_site_eligible_ha', 1, 'ha', 'Whole proposal must be at least 1 ha (can be several compartments).',
   'https://www.gov.uk/guidance/england-woodland-creation-offer'),
  ('min_block_eligible_ha', 0.1, 'ha', 'Each compartment must be at least 0.1 ha.',
   'https://www.gov.uk/guidance/england-woodland-creation-offer'),
  ('max_blocks', 50, 'blocks', 'Abuse limit on screen_site() input.', null),
  ('max_site_drawn_ha', 2000, 'ha', 'Abuse limit on screen_site() input.', null),
  ('low_sensitivity_tolerance_pct', 0.5, '%', 'Share of the eligible area allowed outside the low sensitivity map to absorb edge slivers.', null),
  ('low_sensitivity_tolerance_m2', 100, 'm²', 'Cap on the area allowed outside the low sensitivity map (the smaller limit applies).', null);

insert into rules.ewco_rates
  (code, payment_name, kind, rate_gbp, unit, years, layer_id, qualifying_classes, qualification,
   exclusive_group, requires_public_access, requires_code, design_condition, source_url, date_checked)
values
  ('nature_recovery_premium', 'Nature recovery (premium)', 'one_off', 3300, '£/ha', null,
   'ewco_priority_habitat_network', '{"Premium Spatial Priority"}', 'touches', 'nature_recovery', false, null,
   'Only if your design is at least 80% native species (at least 5 native species, no more than 50% of any one), 25 to 35% small trees and shrubs, at least 1,600 stems per ha, and 10 to 20% open space.',
   'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco', '2026-10-15'),
  ('nature_recovery_high', 'Nature recovery (high)', 'one_off', 2800, '£/ha', null,
   'ewco_priority_habitat_network', '{"High Spatial Priority"}', 'touches', 'nature_recovery', false, null,
   'Only if your design is at least 80% native species (at least 5 native species, no more than 50% of any one), 25 to 35% small trees and shrubs, at least 1,600 stems per ha, and 10 to 20% open space.',
   'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco', '2026-10-15'),
  ('nature_recovery_lower', 'Nature recovery (lower)', 'one_off', 1100, '£/ha', null,
   'ewco_priority_habitat_network', '{"Lower Spatial Priority"}', 'touches', 'nature_recovery', false, null,
   'Only if your design is at least 80% native species (at least 5 native species, no more than 50% of any one), 25 to 35% small trees and shrubs, at least 1,600 stems per ha, and 10 to 20% open space.',
   'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco', '2026-10-15'),
  ('flood_risk', 'Flood risk management', 'one_off', 1000, '£/ha', null,
   'ewco_flood_risk', '{"Opportunity for Floodplain Woodland","Opportunity for Wider Catchment Woodland"}', 'touches', null, false, null,
   'Only if no single species is more than 50%, small trees and shrubs are at most 35%, you plant at least 1,100 stems per ha (up to 2,500 in the wettest floodplain), keep open space to at most 20% in the floodplain, and add no new drains.',
   'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco', '2026-10-15'),
  ('water_quality', 'Water quality', 'one_off', 500, '£/ha', null,
   'ewco_water_quality', '{"High Spatial Priority"}', 'touches', null, false, null,
   'Only if no single species is more than 50%, small trees and shrubs are at most 35%, you plant at least 1,100 stems per ha, and open space is at most 20%.',
   'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco', '2026-10-15'),
  ('riparian', 'Riparian buffer (Keeping Rivers Cool)', 'one_off', 2500, '£/ha', null,
   'ewco_keeping_rivers_cool', null, 'area_inside', null, false, null,
   'Only for the part inside the Keeping Rivers Cool area, mapped as its own compartment, planted with native species within 10 m of the bank to shade at least 50% of the watercourse, at no more than 1,100 stems per ha with 40% open space.',
   'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco', '2026-10-15'),
  ('close_to_settlements', 'Woodland close to settlements', 'one_off', 600, '£/ha', null,
   'ewco_nfc_social', null, 'touches', null, false, null,
   'Only if your design meets the UK Forestry Standard, no single species is more than 50%, small trees and shrubs are at most 35%, and you plant at least 1,100 stems per ha.',
   'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco', '2026-10-15'),
  ('recreational_access', 'Recreational access', 'one_off', 3700, '£/ha', null,
   'ewco_nfc_social', null, 'touches', null, true, 'close_to_settlements',
   'Only if you also meet the close-to-settlements design and give free public access on foot over the whole block, with a path network, in daylight all year for at least 30 years, on land with no existing public access.',
   'https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco', '2026-10-15'),
  ('low_sensitivity', 'Low sensitivity land payment', 'one_off', 1100, '£/ha', null,
   'ewco_low_sensitivity_v4', '{"Low"}', 'whole_site_inside', null, false, null,
   'Only if your whole proposal is inside the low sensitivity area on map version 4.0. Paid once all other work has been claimed.',
   'https://www.gov.uk/guidance/england-woodland-creation-offer', '2026-10-15'),
  ('maintenance', 'Annual maintenance', 'annual', 400, '£/ha/year', 15,
   null, null, 'eligible_area', null, false, null,
   'Only if you look after the new woodland for 15 years. This payment is optional.',
   'https://www.gov.uk/guidance/england-woodland-creation-offer', '2026-10-15'),
  ('planting_costs', 'Planting and capital costs (standard cost cap)', 'costs_covered', 10200, '£/ha', null,
   null, null, 'eligible_area', null, false, null,
   'Pays back actual costs up to an average of £10,200 per ha over the whole area, including open space. It reimburses spending; it is not income.',
   'https://www.gov.uk/guidance/england-woodland-creation-offer', '2026-10-15');

insert into rules.ewco_exclusions
  (code, label, layer_id, qualifying_classes, buffer_m, priority, explanation, date_checked)
values
  ('sssi', 'Site of Special Scientific Interest', 'sssi', null, 0, 1,
   'Protected wildlife site: new woodland here is not screened as eligible.', '2026-10-15'),
  ('scheduled_monument', 'Scheduled Monument (plus 20 m)', 'scheduled_monuments', null, 20, 2,
   'Protected archaeology: the monument and 20 m around it are kept free of planting.', '2026-10-15'),
  ('priority_habitat', 'Priority habitat', 'priority_habitat', null, 0, 3,
   'Existing priority habitat would be lost or damaged by planting.', '2026-10-15'),
  ('deep_peat', 'Deep peat', 'peat_status', '{"Deep Peaty Soils"}', 0, 4,
   'Planting trees on deep peat releases stored carbon, so it is not screened as eligible.', '2026-10-15'),
  ('existing_woodland', 'Existing woodland', 'nfi_woodland', '{"Woodland"}', 0, 5,
   'Land that is already woodland cannot be paid for new woodland creation.', '2026-10-15');

insert into rules.ewco_flags (code, label, layer_id, qualifying_classes, explanation) values
  ('shallow_peat', 'Shallow or patchy peat', 'peat_status', '{"Shallow Peaty Soils","Soils with Peaty Pockets"}',
   'Part of this block is on shallow or patchy peat soil, so you may be asked for a peat depth survey before planting is agreed.'),
  ('best_farmland', 'Grade 1 or 2 farmland', 'alc_provisional', '{"Grade 1","Grade 2"}',
   'Part of this block is mapped as Grade 1 or 2 farmland, the best agricultural land, which the Forestry Commission will weigh before agreeing woodland here.');

insert into rules.messages (code, kind, sort, text) values
  ('site_below_minimum', 'flag', 1,
   'The eligible area is under the 1 ha minimum for the whole proposal, so no payments are calculated.'),
  ('block_below_minimum', 'flag', 2,
   'This block''s eligible area is under the 0.1 ha minimum per block, so it is left out of the payments.'),
  ('indicative', 'limitation', 1,
   'Indicative screening from public map data, not an offer of grant. The Forestry Commission decides eligibility.'),
  ('screening_exclusions', 'limitation', 2,
   'SSSIs, priority habitat, Scheduled Monuments and deep peat are removed as screening exclusions based on wider woodland creation rules; the EWCO pages do not list them as ineligible.'),
  ('min_width', 'limitation', 3,
   'The minimum width of 20 m (10 m for riparian buffers and shelterbelts) is not checked.'),
  ('developed_land', 'limitation', 4,
   'Developed land and hard standing are ineligible but not mapped here, so they are not removed.'),
  ('low_sensitivity_variant', 'limitation', 5,
   'The exception allowing up to 10% of the woodland outside the low sensitivity area (map v4.0 variant 3) is not applied.'),
  ('access_land', 'limitation', 6,
   'Recreational access cannot be paid on open access (CRoW) land or land that already has public access; this is not checked.'),
  ('non_spatial', 'limitation', 7,
   'Some payments can be agreed outside the mapped areas with an adviser''s confirmation; this screen uses the maps only.'),
  ('red_squirrel', 'limitation', 8,
   'Nature recovery for red squirrel habitat is not assessed.');

-- ---------------------------------------------------------------------------
-- Engine
-- ---------------------------------------------------------------------------

create function rules.setting(setting_key text)
returns numeric
language sql
stable
set search_path = rules, pg_temp
as $$
  select value from rules.settings where key = setting_key;
$$;

-- Union of a layer's pieces (optionally limited to some classes, optionally
-- buffered) near a geometry. Returns null if nothing is there.
create function rules.layer_near(
  target extensions.geometry, layer text, classes text[], buffer_m numeric default 0
)
returns extensions.geometry
language sql
stable
set search_path = extensions, layers, pg_temp
as $$
  select st_union(case when buffer_m > 0 then st_buffer(f.geom, buffer_m) else f.geom end)
  from layers.features f
  where f.layer_id = layer
    and (classes is null or f.class = any (classes))
    and st_dwithin(f.geom, target, buffer_m);
$$;

create function rules.layer_touches(target extensions.geometry, layer text, classes text[])
returns boolean
language sql
stable
set search_path = extensions, layers, pg_temp
as $$
  select exists (
    select 1 from layers.features f
    where f.layer_id = layer
      and (classes is null or f.class = any (classes))
      and st_intersects(f.geom, target)
  );
$$;

-- Screen a proposed woodland site for EWCO.
--   site: GeoJSON FeatureCollection in longitude/latitude; one Polygon or
--         MultiPolygon Feature per block, optional properties.name.
--   public_access: will the owner offer public access for at least 30 years?
-- Returns one JSON document: summary, income, costs covered, per-block detail,
-- flags and limitations.
create function public.screen_site(site jsonb, public_access boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = extensions, rules, layers, pg_temp
as $$
declare
  min_site_ha numeric := rules.setting('min_site_eligible_ha');
  min_block_ha numeric := rules.setting('min_block_eligible_ha');
  max_blocks int := rules.setting('max_blocks');
  max_ha numeric := rules.setting('max_site_drawn_ha');
  tol_pct numeric := rules.setting('low_sensitivity_tolerance_pct');
  tol_m2 numeric := rules.setting('low_sensitivity_tolerance_m2');

  feats jsonb;
  n int;
  i int;
  g extensions.geometry;
  names text[] := '{}';
  drawn extensions.geometry[] := '{}';
  elig extensions.geometry[] := '{}';
  block_ok boolean[] := '{}';
  removed_out jsonb[] := '{}';
  flags_out jsonb[] := '{}';

  remaining extensions.geometry;
  cover extensions.geometry;
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
  blocks_out jsonb := '[]';
  site_flags jsonb := '[]';
  one_off jsonb;
  one_off_total numeric;
  maint jsonb;
  costs_total jsonb;
begin
  -- Validate input ---------------------------------------------------------
  if site is null or site ->> 'type' is distinct from 'FeatureCollection'
     or jsonb_typeof(site -> 'features') is distinct from 'array' then
    raise exception using errcode = '22023',
      message = 'site must be a GeoJSON FeatureCollection with one Feature per block';
  end if;
  feats := site -> 'features';
  n := jsonb_array_length(feats);
  if n = 0 or n > max_blocks then
    raise exception using errcode = '22023',
      message = format('site must have between 1 and %s blocks (got %s)', max_blocks, n);
  end if;

  for i in 1..n loop
    begin
      g := st_geomfromgeojson(feats -> (i - 1) -> 'geometry');
    exception when others then
      raise exception using errcode = '22023',
        message = format('block %s: geometry is not valid GeoJSON', i);
    end;
    if g is null or geometrytype(g) not in ('POLYGON', 'MULTIPOLYGON') then
      raise exception using errcode = '22023',
        message = format('block %s: geometry must be a Polygon or MultiPolygon', i);
    end if;
    if st_srid(g) = 0 then g := st_setsrid(g, 4326); end if;
    if st_srid(g) <> 4326 or st_xmin(g) < -180 or st_xmax(g) > 180 or st_ymin(g) < -90 or st_ymax(g) > 90 then
      raise exception using errcode = '22023',
        message = format('block %s: coordinates must be longitude/latitude (WGS84)', i);
    end if;
    g := st_collectionextract(st_makevalid(st_transform(g, 27700)), 3);
    if st_isempty(g) or st_area(g) = 0 then
      raise exception using errcode = '22023', message = format('block %s: polygon has no area', i);
    end if;
    names := names || coalesce(nullif(trim(feats -> (i - 1) -> 'properties' ->> 'name'), ''), 'Block ' || i);
    drawn := drawn || g;
  end loop;

  -- Aggregate form: st_union(geometry[]) drops the SRID.
  drawn_union := (select st_union(d) from unnest(drawn) d);
  if st_area(drawn_union) / 1e4 > max_ha then
    raise exception using errcode = '22023',
      message = format('site is larger than the %s ha limit', max_ha);
  end if;
  if (select sum(st_area(d)) from unnest(drawn) d) - st_area(drawn_union) > 1 then
    raise exception using errcode = '22023', message = 'blocks must not overlap each other';
  end if;
  if st_area(st_difference(drawn_union, (select st_union(geom) from layers.regions))) > 1 then
    raise exception using errcode = '22023',
      message = 'site is outside the area we have data for (currently Cambridgeshire and Peterborough)';
  end if;

  -- Eligibility per block ----------------------------------------------------
  for i in 1..n loop
    remaining := drawn[i];
    removed := '[]';
    for ex in select * from rules.ewco_exclusions order by priority loop
      cover := rules.layer_near(remaining, ex.layer_id, ex.qualifying_classes, ex.buffer_m);
      continue when cover is null;
      a := st_area(st_intersection(remaining, cover));
      continue when a < 1;  -- ignore sub-square-metre slivers
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

    elig := elig || remaining;
    block_ok := block_ok || (st_area(remaining) / 1e4 >= min_block_ha);
    removed_out := removed_out || removed;
    flags_out := flags_out || flags;
    if block_ok[i] then site_eligible_m2 := site_eligible_m2 + st_area(remaining); end if;
  end loop;

  site_ok := site_eligible_m2 / 1e4 >= min_site_ha;

  -- Low sensitivity: whole eligible proposal inside the map (with tolerance) -
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
        if r.qualification = 'eligible_area' then
          pay_m2 := st_area(elig[i]);
        elsif r.qualification = 'whole_site_inside' then
          if lsm_ok then pay_m2 := st_area(elig[i]); end if;
        elsif r.exclusive_group is not null and r.exclusive_group = any (paid_groups) then
          continue;
        elsif r.qualification = 'touches' then
          if rules.layer_touches(elig[i], r.layer_id, r.qualifying_classes) then
            pay_m2 := st_area(elig[i]);
          end if;
        elsif r.qualification = 'area_inside' then
          cover := rules.layer_near(elig[i], r.layer_id, r.qualifying_classes);
          if cover is not null then pay_m2 := st_area(st_intersection(elig[i], cover)); end if;
        end if;
        continue when pay_m2 is null or pay_m2 < 1;

        if r.requires_code is not null and not (r.requires_code = any (paid_codes)) then
          continue;
        end if;
        if r.requires_public_access and not coalesce(public_access, false) then
          not_applied := not_applied || jsonb_build_object(
            'code', r.code, 'payment', r.payment_name,
            'reason', 'You answered no to offering public access for 30 years.',
            'would_be_gbp', round(r.rate_gbp * pay_m2 / 1e4));
          continue;
        end if;

        paid_codes := paid_codes || r.code;
        if r.exclusive_group is not null then paid_groups := paid_groups || r.exclusive_group; end if;

        if r.kind = 'costs_covered' then
          costs := costs || jsonb_build_object(
            'code', r.code, 'name', r.payment_name, 'rate_gbp', r.rate_gbp, 'unit', r.unit,
            'ha', round((pay_m2 / 1e4)::numeric, 2), 'up_to_gbp', round(r.rate_gbp * pay_m2 / 1e4),
            'condition', r.design_condition);
        else
          payments := payments || jsonb_build_object(
            'code', r.code, 'name', r.payment_name, 'kind', r.kind,
            'rate_gbp', r.rate_gbp, 'unit', r.unit,
            'basis', case r.qualification
                       when 'touches' then 'whole eligible block (block touches the target area)'
                       when 'area_inside' then 'only the part of the block inside the target area'
                       when 'whole_site_inside' then 'whole eligible block (entire proposal inside the map)'
                       else 'whole eligible block' end,
            'ha', round((pay_m2 / 1e4)::numeric, 2),
            'amount_gbp', round(r.rate_gbp * pay_m2 / 1e4),
            'years', r.years,
            'total_gbp', round(r.rate_gbp * pay_m2 / 1e4) * coalesce(r.years, 1),
            'condition', r.design_condition);
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
      'flags', flags_out[i] || case when block_ok[i] then '[]'::jsonb else jsonb_build_array(
                 jsonb_build_object('code', 'block_below_minimum', 'explanation',
                   (select text from rules.messages where code = 'block_below_minimum'))) end,
      'payments', payments,
      'costs_covered', costs,
      'not_applied', not_applied);
  end loop;

  if not site_ok then
    site_flags := site_flags || jsonb_build_object('code', 'site_below_minimum', 'explanation',
      (select text from rules.messages where code = 'site_below_minimum'));
  end if;

  -- Totals -------------------------------------------------------------------
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'ha', ha, 'amount_gbp', amount)
                            order by amount desc, code), '[]'),
         coalesce(sum(amount), 0)
    into one_off, one_off_total
  from (
    select p ->> 'code' code, p ->> 'name' name,
           sum((p ->> 'ha')::numeric) ha, sum((p ->> 'amount_gbp')::numeric) amount
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

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'blocks', n,
      'drawn_ha', round((st_area(drawn_union) / 1e4)::numeric, 2),
      'eligible_ha', round((site_eligible_m2 / 1e4)::numeric, 2),
      'meets_site_minimum', site_ok,
      'public_access', coalesce(public_access, false),
      'low_sensitivity_whole_site', lsm_ok),
    'income', jsonb_build_object(
      'one_off', one_off,
      'one_off_total_gbp', one_off_total,
      'annual_maintenance', maint,
      'total_income_gbp', one_off_total + coalesce((maint ->> 'total_gbp')::numeric, 0)),
    'costs_covered', costs_total,
    'blocks', blocks_out,
    'site_flags', site_flags,
    'limitations', (select jsonb_agg(text order by sort) from rules.messages where kind = 'limitation'),
    'rates_checked', (select max(date_checked) from rules.ewco_rates),
    'sources', (select jsonb_agg(distinct source_url) from rules.ewco_rates)
  );
end;
$$;

revoke all on function rules.setting(text) from public, anon, authenticated;
revoke all on function rules.layer_near(extensions.geometry, text, text[], numeric) from public, anon, authenticated;
revoke all on function rules.layer_touches(extensions.geometry, text, text[]) from public, anon, authenticated;
revoke all on function public.screen_site(jsonb, boolean) from public;
grant execute on function public.screen_site(jsonb, boolean) to anon, authenticated;
