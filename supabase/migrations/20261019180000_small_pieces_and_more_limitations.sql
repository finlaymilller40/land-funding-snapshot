-- After removals, a field can be split into separate pieces. Each compartment
-- must be at least 0.1 ha (gov.uk EWCO guidance, "What land is eligible"), so
-- pieces under rules.settings.min_block_eligible_ha are now left out, shown as
-- their own removal ("small_piece"). Before, only the field's total was tested.
--
-- Also: limitations for land control and existing agreements (EWCO guidance)
-- and for forestry EIA (gov.uk "Environmental impact assessments for
-- woodland", updated 18 Oct 2023), with a source and date per message.
--
-- Wording checked on 2026-10-19 against:
--   G = https://www.gov.uk/guidance/england-woodland-creation-offer
--   E = https://www.gov.uk/guidance/environmental-impact-assessments-for-woodland

alter table rules.messages
  add column label text,
  add column source_url text,
  add column date_checked date;

insert into rules.messages (code, kind, sort, label, text, source_url, date_checked) values
  ('small_piece', 'flag', 4, 'Piece under 0.1 ha',
   'Once the land above is left out, this part of the field is a separate piece under 0.1 ha. Each compartment must be at least 0.1 ha, so it is left out too.',
   'https://www.gov.uk/guidance/england-woodland-creation-offer#what-land-is-eligible', '2026-10-19'),
  ('land_control', 'limitation', 9, null,
   'You must have management control of the land for the whole agreement. Tenants need their landlord to agree and countersign, and land in a dispute in the past 12 months can''t be included. This is not checked.',
   'https://www.gov.uk/guidance/england-woodland-creation-offer#tenanted-land', '2026-10-19'),
  ('existing_agreements', 'limitation', 10, null,
   'Land in an Environmental Stewardship, Countryside Stewardship or Sustainable Farming Incentive agreement is generally not compatible with EWCO (only the SFI hedgerow options HRW1 to HRW3 are). With more than 6 months left, the land must come out of that agreement first, which can mean repaying some of it. This is not checked.',
   'https://www.gov.uk/guidance/england-woodland-creation-offer#eligible-land-receiving-other-public-funding', '2026-10-19'),
  ('eia', 'limitation', 11, null,
   'Whether the planting needs Environmental Impact Assessment consent is not checked. Planting 0.5 ha or more counts as afforestation under the forestry EIA regulations, and larger projects or those in sensitive areas are more likely to need consent. For a grant application, the Forestry Commission advises not applying for an EIA decision separately: your application normally gives it what it needs.',
   'https://www.gov.uk/guidance/environmental-impact-assessments-for-woodland#grant-applications', '2026-10-19');

-- screen_site -----------------------------------------------------------------
-- As in 20261017130000, plus: pieces under the block minimum are left out, and
-- the sources list includes the messages' sources.
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
  small_label text := (select label from rules.messages where code = 'small_piece');
  small_text text := (select text from rules.messages where code = 'small_piece');

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
  if min_site_ha is null or min_block_ha is null or tol_pct is null or tol_m2 is null or large_ha is null
     or small_label is null or small_text is null then
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

    -- Each compartment must be at least the block minimum: when what is left
    -- is in several separate pieces, the pieces under it are left out too.
    -- (A field that is one small piece keeps the block_below_minimum flag.)
    if st_numgeometries(remaining) > 1 then
      cut := (select st_collect(d.geom) from st_dump(remaining) d where st_area(d.geom) < min_block_ha * 1e4);
      if cut is not null then
        a := st_area(cut);
        remaining := coalesce(
          (select st_multi(st_collect(d.geom)) from st_dump(remaining) d where st_area(d.geom) >= min_block_ha * 1e4),
          st_setsrid('MULTIPOLYGON EMPTY'::extensions.geometry, 27700));
        if a >= 1 then  -- sub-square-metre slivers are dropped silently
          shapes := shapes || jsonb_build_object(
            'type', 'Feature',
            'properties', jsonb_build_object('code', 'small_piece', 'reason', small_label),
            'geometry', rules.to_geojson(cut, shape_tol));
          removed := removed || jsonb_build_object(
            'code', 'small_piece', 'reason', small_label, 'ha', round((a / 1e4)::numeric, 2),
            'explanation', small_text);
        end if;
      end if;
    end if;

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
                  union select source_url from rules.guidance_steps
                  union select split_part(source_url, '#', 1) from rules.messages
                  where kind = 'limitation' and source_url is not null) s)
  );
end;
$$;

revoke all on function public.screen_site(jsonb, boolean) from public;
grant execute on function public.screen_site(jsonb, boolean) to anon, authenticated;
