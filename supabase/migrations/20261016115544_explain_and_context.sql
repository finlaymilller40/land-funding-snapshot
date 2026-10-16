-- Phase 3b: explain the "why" and support the interactive results map.
--  * Developed land (Living England built-up areas, gardens, solar farms) is a
--    new screening exclusion.
--  * Large-block warning (threshold in rules.settings).
--  * rules.guidance_steps: "how to get this" text with gov.uk sources.
--  * rules.parse_site(): input checks shared by screen_site() and site_context().
--  * screen_site(): per payment, the area actually inside the target area, a
--    low estimate paid only on that area, and its shape; low/high totals;
--    next steps.
--  * public.site_context(): simplified target/exclusion/flag shapes, only
--    within a set distance of the user's land.

-- Settings --------------------------------------------------------------------
insert into rules.settings (key, value, unit, note) values
  ('large_block_ha', 50, 'ha', 'Blocks drawn larger than this get a warning that touch-based payments will be overstated.'),
  ('context_buffer_m', 1000, 'm', 'site_context() returns layer shapes only within this distance of the drawn land.'),
  ('context_simplify_m', 5, 'm', 'Simplification tolerance for site_context() shapes.');

-- Developed land exclusion ---------------------------------------------------
insert into rules.ewco_exclusions
  (code, label, layer_id, qualifying_classes, buffer_m, priority, explanation, source_url, date_checked)
values
  ('developed_land', 'Developed land', 'developed_land', '{"Built-up Areas and Gardens","Solar Farms"}', 0, 6,
   'Buildings, gardens, yards, hard standing and solar farms can''t be planted with new woodland.',
   'https://www.gov.uk/guidance/england-woodland-creation-offer', '2026-10-16');

update rules.messages set text =
  'Developed land is removed using Natural England''s Living England map (built-up areas, gardens and solar farms), which is mapped from satellite images at about 10 m and may miss small sites or recent building.'
where code = 'developed_land';

insert into rules.messages (code, kind, sort, text) values
  ('large_block', 'flag', 3,
   'This field is over %s ha. Real applications split land into compartments designed with a Woodland Officer, so bonuses that only need a field to touch a target area will be overstated for a field this big. Try drawing your individual fields.');

-- How to get this -------------------------------------------------------------
create table rules.guidance_steps (
  code text primary key,
  sort int not null unique,
  title text not null,
  body text not null,
  min_site_ha numeric,          -- only shown when the plantable area is at least this
  source_url text not null,
  date_checked date not null
);
alter table rules.guidance_steps enable row level security;

insert into rules.guidance_steps (code, sort, title, body, min_site_ha, source_url, date_checked) values
  ('register', 1, 'Register on the Rural Payments service',
   'You need a Rural Payments account to apply. Register yourself to get a Customer Registration Number and a Single Business Identifier, then register your land parcels. You don''t need to be a business.',
   null, 'https://www.gov.uk/guidance/england-woodland-creation-offer', '2026-10-16'),
  ('woodland_officer', 2, 'Talk to your local Woodland Officer',
   'A Forestry Commission Woodland Officer will help you prepare your application and design your compartments. You can also email EWCO@forestrycommission.gov.uk.',
   null, 'https://www.gov.uk/guidance/england-woodland-creation-offer', '2026-10-16'),
  ('planning_grant', 3, 'Consider the Woodland Creation Planning Grant first',
   'Because the land you could plant is 5 hectares or more, you can first apply for the Woodland Creation Planning Grant. It pays towards the surveys and design work for a plan that meets the UK Forestry Standard (up to £30,500 per project), has its own application and is open all year.',
   5, 'https://www.gov.uk/guidance/woodland-creation-planning-grant', '2026-10-16'),
  ('plan', 4, 'Prepare a planting plan that meets the UK Forestry Standard',
   'Your design, species and management must follow the UK Forestry Standard. Get any planning permission or other consents before work starts, and prepare a map of your planting compartments.',
   null, 'https://www.gov.uk/guidance/england-woodland-creation-offer', '2026-10-16'),
  ('apply', 5, 'Apply by 31 May for the next planting season',
   'You can apply at any time, but applications take 3 to 5 months to process. Apply by 31 May to get an agreement in time for the next planting season; after October that is unlikely. EWCO is competitive and applications are scored.',
   null, 'https://www.gov.uk/guidance/england-woodland-creation-offer', '2026-10-16'),
  ('payments', 6, 'When you are paid',
   'Once you have an agreement you have 3 years to finish the planting, claiming at least £5,000 at a time, and planting costs are paid back as you claim. Bonus payments are paid once the planting is signed off; the lower-risk land payment after all other work is claimed. Upkeep is paid each autumn for 15 years: the first 5 years after your final planting claim (submit it by 31 August for payments to start that autumn), then you claim again in years 6 and 11.',
   null, 'https://www.gov.uk/guidance/england-woodland-creation-offer', '2026-10-16'),
  ('land_use', 7, 'The land stops being farmland',
   'Land in an EWCO agreement can''t be farmed. You register it with the Rural Payments Agency as permanently non-agricultural from 1 January after your agreement starts, and must look after the woodland for 15 years after the final planting payment. You can still get delinked payments if you are eligible.',
   null, 'https://www.gov.uk/guidance/england-woodland-creation-offer', '2026-10-16');

-- Shared input checks ---------------------------------------------------------
-- Raises the same plain errors (SQLSTATE 22023) for screen_site() and
-- site_context(). Returns each block as British National Grid geometry.
create function rules.parse_site(site jsonb)
returns table (idx int, name text, geom extensions.geometry)
language plpgsql
stable
set search_path = extensions, rules, layers, pg_temp
as $$
declare
  max_blocks int := rules.setting('max_blocks');
  max_ha numeric := rules.setting('max_site_drawn_ha');
  feats jsonb;
  n int;
  i int;
  g extensions.geometry;
  names text[] := '{}';
  drawn extensions.geometry[] := '{}';
  drawn_union extensions.geometry;
  regions_union extensions.geometry;
begin
  if max_blocks is null or max_ha is null then
    raise exception 'parse_site: rules.settings is incomplete';
  end if;
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
  -- No regions loaded means no layer data: refuse (a null union would make the
  -- comparison null, which IF treats as false).
  regions_union := (select st_union(r.geom) from layers.regions r);
  if regions_union is null
     or coalesce(st_area(st_difference(drawn_union, regions_union)), st_area(drawn_union)) > 1 then
    raise exception using errcode = '22023',
      message = 'site is outside the area we have data for (currently Cambridgeshire and Peterborough)';
  end if;

  return query select t.ord::int, t.nm, t.gm from unnest(names, drawn) with ordinality as t(nm, gm, ord);
end;
$$;

revoke all on function rules.parse_site(jsonb) from public, anon, authenticated;

-- screen_site -----------------------------------------------------------------
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
  blocks_out jsonb := '[]';
  site_flags jsonb := '[]';
  one_off jsonb;
  one_off_total numeric;
  one_off_low numeric;
  maint jsonb;
  costs_total jsonb;
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
    for ex in select * from rules.ewco_exclusions order by priority loop
      cover := rules.layer_near(remaining, ex.layer_id, ex.qualifying_classes, ex.buffer_m);
      continue when cover is null;
      cut := st_collectionextract(st_intersection(remaining, cover), 3);
      a := st_area(cut);
      continue when a < 1;  -- ignore sub-square-metre slivers
      shapes := shapes || jsonb_build_object(
        'type', 'Feature',
        'properties', jsonb_build_object('code', ex.code, 'reason', ex.label),
        'geometry', rules.to_geojson(cut));
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
            'qualifying_geometry', case when inside is null or st_isempty(inside) then null
                                        else rules.to_geojson(inside) end);
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
        'eligible', case when st_isempty(elig[i]) then null else rules.to_geojson(elig[i]) end,
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

-- site_context ----------------------------------------------------------------
-- Simplified shapes of every payment target area, exclusion and flag layer,
-- clipped to within context_buffer_m of the user's drawn land. Same input
-- checks as screen_site(). Never returns attributes, only a label per group.
create function public.site_context(site jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = extensions, rules, layers, pg_temp
as $$
declare
  buffer_m numeric := rules.setting('context_buffer_m');
  simplify_m numeric := rules.setting('context_simplify_m');
  area extensions.geometry;
  tol numeric;
  result jsonb;
begin
  if buffer_m is null or simplify_m is null then
    raise exception 'site_context: rules.settings is incomplete';
  end if;
  area := st_buffer((select st_union(p.geom) from rules.parse_site(site) p), buffer_m);
  -- Coarser for bigger areas: 5 m for a typical farm, about 13 m at the
  -- 2,000 ha maximum. Context only; the estimate itself uses full detail.
  tol := greatest(simplify_m, sqrt(st_area(area)) / 500);

  with groups as (
    -- Payment target areas: one group per layer and qualifying classes.
    select 'target'::text kind, rt.layer_id, rt.qualifying_classes classes, 0::numeric buffer,
           array_agg(rt.code order by rt.rate_gbp desc) payments,
           (array_agg(rt.payment_name order by rt.rate_gbp desc))[1] label,
           max(rt.rate_gbp) sort_key
    from rules.ewco_rates rt
    where rt.layer_id is not null
    group by rt.layer_id, rt.qualifying_classes
    union all
    select 'exclusion', e.layer_id, e.qualifying_classes, e.buffer_m, null, e.label, -e.priority
    from rules.ewco_exclusions e
    union all
    select 'flag', f.layer_id, f.qualifying_classes, 0, null, f.label, 0
    from rules.ewco_flags f
  ),
  -- Pieces are collected, not merged: merging thousands of pieces per request
  -- was the slow part (1.3 s for a 2,000 ha site). Only pieces crossing the
  -- edge of the area are clipped; slivers under 50 m² are dropped.
  shapes as (
    select g.kind, g.layer_id, g.classes, g.payments, g.label, g.sort_key,
           (select st_collect(c.geom)
            from (
              select st_simplifypreservetopology(
                       case when st_coveredby(p.geom, area) then p.geom
                            else st_collectionextract(st_intersection(p.geom, area), 3) end, tol) geom
              from (
                select case when g.buffer > 0 then st_buffer(f.geom, g.buffer) else f.geom end geom
                from layers.features f
                where f.layer_id = g.layer_id
                  and (g.classes is null or f.class = any (g.classes))
                  and f.geom && st_expand(area, g.buffer)   -- index-friendly box filter first
                  and st_dwithin(f.geom, area, g.buffer)
              ) p
            ) c
            where not st_isempty(c.geom) and st_area(c.geom) >= 50) geom
    from groups g
  )
  select jsonb_agg(jsonb_build_object(
           'id', s.kind || ':' || s.layer_id || coalesce(':' || array_to_string(s.classes, '|'), ''),
           'kind', s.kind,
           'layer_id', s.layer_id,
           'label', s.label,
           'payments', to_jsonb(s.payments),
           'geometry', case when s.geom is null or st_isempty(s.geom) then null
                            else st_asgeojson(st_transform(s.geom, 4326), 6)::jsonb end)
         order by s.kind desc, s.sort_key desc, s.label)
    into result
  from shapes s;

  return jsonb_build_object(
    'buffer_m', buffer_m,
    'simplified_m', round(tol, 1),
    'layers', coalesce(result, '[]'::jsonb));
end;
$$;

revoke all on function public.site_context(jsonb) from public;
grant execute on function public.site_context(jsonb) to anon, authenticated;
