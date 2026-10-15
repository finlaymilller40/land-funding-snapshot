-- Phase 1: private schema for open data layers (SSSIs, peat, ALC, EWCO, ...).
-- Not listed in the Data API's exposed schemas, and API roles get no access:
-- the website must never read raw layers directly.

create schema layers;
create schema layers_staging; -- scratch tables written by scripts/load_layers

revoke all on schema layers, layers_staging from public, anon, authenticated;

-- Regions the layers are clipped to (e.g. Cambridgeshire and Peterborough).
create table layers.regions (
  id text primary key,
  name text not null,
  source_url text not null,
  source_code text,
  loaded_at timestamptz not null default now(),
  geom extensions.geometry(MultiPolygon, 27700) not null
);

-- One row per layer: where it came from and the terms it is used under.
create table layers.sources (
  id text primary key,
  name text not null,
  category text not null
    check (category in ('hard_constraint', 'soft_constraint', 'ewco_payment', 'reference')),
  publisher text not null,
  service_url text not null,
  info_url text,
  version text,
  licence text not null,
  licence_url text,
  attribution text not null,
  notes text,
  downloaded_at timestamptz,
  loaded_at timestamptz
);

-- Every layer's features in one table, clipped to the region and split into
-- small pieces so spatial lookups stay fast. `class` holds the attribute that
-- matters for rules (peat class, ALC grade, EWCO category); `attributes` keeps
-- the full source record.
create table layers.features (
  id bigint generated always as identity primary key,
  layer_id text not null references layers.sources (id) on delete cascade,
  region_id text not null references layers.regions (id) on delete cascade,
  source_fid text,
  class text,
  name text,
  attributes jsonb not null default '{}',
  geom extensions.geometry(Polygon, 27700) not null
);

create index regions_geom_idx on layers.regions using gist (geom);
create index features_geom_idx on layers.features using gist (geom);
create index features_layer_region_idx on layers.features (layer_id, region_id);

-- RLS on every table from day one. No policies: only the loader (postgres)
-- reads or writes these tables.
alter table layers.regions enable row level security;
alter table layers.sources enable row level security;
alter table layers.features enable row level security;

-- Which layers a site overlaps, and by how much. Accepts any SRID; areas are
-- in hectares on British National Grid. Overlapping pieces within a layer
-- are unioned first so nothing is double counted.
create function layers.site_overlaps(site extensions.geometry)
returns table (
  layer_id text,
  layer_name text,
  category text,
  class text,
  overlap_ha numeric
)
language sql
stable
set search_path = extensions, layers, pg_temp
as $$
  with s as (
    select case when st_srid(site) = 27700 then site
                else st_transform(site, 27700) end as g
  ),
  hits as (
    select f.layer_id, f.class, st_union(st_intersection(f.geom, s.g)) as g
    from s
    join layers.features f on st_intersects(f.geom, s.g)
    group by f.layer_id, f.class
  )
  select h.layer_id, src.name, src.category, h.class,
         round((st_area(h.g) / 10000)::numeric, 3)
  from hits h
  join layers.sources src on src.id = h.layer_id
  where st_area(h.g) > 0
  order by src.category, h.layer_id, h.class;
$$;

revoke all on function layers.site_overlaps(extensions.geometry) from public, anon, authenticated;
