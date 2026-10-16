-- Fix: with no regions loaded, screen_site() screened sites against empty
-- layers and reported everything as plantable. It now refuses, as it does for
-- sites outside the covered area. Found by checking the hosted database before
-- its layers were loaded. Also fails closed if any rules.settings value is
-- missing, for the same reason.

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
  removed_shapes jsonb[] := '{}';
  shapes jsonb;
  cut extensions.geometry;
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
  regions_union extensions.geometry;
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
  -- Missing settings would make the limits below compare against null and
  -- silently pass. Fail closed instead.
  if min_site_ha is null or min_block_ha is null or max_blocks is null or max_ha is null
     or tol_pct is null or tol_m2 is null then
    raise exception 'screen_site: rules.settings is incomplete';
  end if;

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
  -- No regions loaded means no layer data: refuse rather than screen against
  -- nothing. (A null union would make the comparison below null, which IF
  -- treats as false, letting any site through.)
  regions_union := (select st_union(geom) from layers.regions);
  if regions_union is null
     or coalesce(st_area(st_difference(drawn_union, regions_union)), st_area(drawn_union)) > 1 then
    raise exception using errcode = '22023',
      message = 'site is outside the area we have data for (currently Cambridgeshire and Peterborough)';
  end if;

  -- Eligibility per block ----------------------------------------------------
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

    elig := elig || remaining;
    block_ok := block_ok || (st_area(remaining) / 1e4 >= min_block_ha);
    removed_out := removed_out || removed;
    removed_shapes := removed_shapes || shapes;
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

revoke all on function public.screen_site(jsonb, boolean) from public;
grant execute on function public.screen_site(jsonb, boolean) to anon, authenticated;
