#!/usr/bin/env bash
# One-off analysis (D63): how much Ramsar, SPA, SAC, NNR and LNR land in the
# region lies outside SSSIs, i.e. land the SSSI exclusion does not already
# remove.
#
#   ./scripts/analyse_protected_sites.sh            # reuse earlier downloads
#   ./scripts/analyse_protected_sites.sh --refresh  # download again
#
# Downloads the five Natural England layers (Open Government Licence v3.0)
# inside the region's bounding box into data/raw/<region>/analysis/ (git
# ignored), with the same GDAL image as the loader. Loads them into a
# temporary schema in the LOCAL database only, compares them with the loaded
# SSSIs and region boundary, prints the result and drops the schema. Nothing
# in the rules or layers schemas changes.
set -euo pipefail
cd "$(dirname "$0")/.."

REGION=cambridgeshire-and-peterborough
RAW="$PWD/data/raw/$REGION/analysis"
GDAL_IMAGE=ghcr.io/osgeo/gdal:ubuntu-small-3.13.3
CONTAINER=supabase_db_land-funding-snapshot
BASE=https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services
LAYERS=(
  "ramsar|Ramsar_England"
  "spa|Special_Protection_Areas_England"
  "sac|Special_Areas_of_Conservation_England"
  "nnr|National_Nature_Reserves_England"
  "lnr|Local_Nature_Reserves_England"
)
mkdir -p "$RAW"

psql_local() { docker exec -i "$CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 "$@"; }

# Region bounding box, from the loaded boundary.
BBOX=$(psql_local -tA -c "select concat_ws(',', floor(st_xmin(geom)), floor(st_ymin(geom)), ceil(st_xmax(geom)), ceil(st_ymax(geom))) from layers.regions where id = '$REGION'")
[ -n "$BBOX" ] || { echo "Region $REGION is not loaded locally." >&2; exit 1; }

gdal() {
  docker run --rm -v "$RAW:/data" -e PGPASSWORD=postgres -e OGR_ORGANIZE_POLYGONS=ONLY_CCW \
    -e GDAL_HTTP_MAX_RETRY=5 -e GDAL_HTTP_RETRY_DELAY=10 -e CPL_LOG=/dev/null "$GDAL_IMAGE" "$@"
}

psql_local -c "drop schema if exists analysis_tmp cascade; create schema analysis_tmp;"
for entry in "${LAYERS[@]}"; do
  id=${entry%%|*}; service="$BASE/${entry#*|}/FeatureServer/0"
  if [ ! -f "$RAW/$id.gpkg" ] || [ "${1:-}" = "--refresh" ]; then
    echo "Downloading $id from ${entry#*|} ..."
    rm -f "$RAW/$id.gpkg"
    gdal ogr2ogr -f GPKG "/data/$id.gpkg" \
      "ESRIJSON:$service/query?where=1%3D1&geometry=$BBOX&geometryType=esriGeometryEnvelope&inSR=27700&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=27700&resultRecordCount=1000&f=json" \
      -nln "$id" -nlt MULTIPOLYGON -a_srs EPSG:27700
  fi
  gdal ogr2ogr -f PostgreSQL "PG:dbname=postgres host=host.docker.internal port=54322 user=postgres" "/data/$id.gpkg" \
    -nln "analysis_tmp.$id" -overwrite -lco GEOMETRY_NAME=geom -nlt PROMOTE_TO_MULTI -t_srs EPSG:27700
done

psql_local <<SQL
\pset footer off
set search_path = extensions, public;
create table analysis_tmp.region as select geom from layers.regions where id = '$REGION';
create table analysis_tmp.sssi as
  select st_union(f.geom) geom from layers.features f where f.layer_id = 'sssi';
-- Each designation: dissolved, made valid, clipped to the region.
create table analysis_tmp.sites as
  select d.id, d.label, d.n, st_intersection(d.geom, r.geom) geom
  from (
    select 'ramsar' id, 'Ramsar' label, count(*) n, st_union(st_makevalid(geom)) geom from analysis_tmp.ramsar
    union all select 'spa', 'Special Protection Area (SPA)', count(*), st_union(st_makevalid(geom)) from analysis_tmp.spa
    union all select 'sac', 'Special Area of Conservation (SAC)', count(*), st_union(st_makevalid(geom)) from analysis_tmp.sac
    union all select 'nnr', 'National Nature Reserve (NNR)', count(*), st_union(st_makevalid(geom)) from analysis_tmp.nnr
    union all select 'lnr', 'Local Nature Reserve (LNR)', count(*), st_union(st_makevalid(geom)) from analysis_tmp.lnr
  ) d, analysis_tmp.region r;
insert into analysis_tmp.sites
  select 'all', 'All five combined', null, st_union(geom) from analysis_tmp.sites;

\echo
\echo === Protected sites in the region, and how much lies outside SSSIs ===
select s.label as designation,
       s.n as "features in box",
       round((st_area(s.geom) / 1e4)::numeric, 1) as "ha in region",
       round((coalesce(st_area(st_difference(s.geom, x.geom)), st_area(s.geom)) / 1e4)::numeric, 1) as "ha outside SSSI",
       round((100 * coalesce(st_area(st_difference(s.geom, x.geom)), st_area(s.geom)) / nullif(st_area(s.geom), 0))::numeric, 1) as "% outside SSSI"
from analysis_tmp.sites s, analysis_tmp.sssi x
order by s.id = 'all', s.id;

\echo
\echo === Sites with more than 1 ha outside SSSIs ===
select d.id as designation, d.name, round((st_area(d.out) / 1e4)::numeric, 1) as "ha outside SSSI"
from (
  select t.id, t.name, st_difference(st_intersection(st_makevalid(t.geom), r.geom), x.geom) out
  from (
    select 'ramsar' id, name, geom from analysis_tmp.ramsar
    union all select 'spa', name, geom from analysis_tmp.spa
    union all select 'sac', name, geom from analysis_tmp.sac
    union all select 'nnr', name, geom from analysis_tmp.nnr
    union all select 'lnr', name, geom from analysis_tmp.lnr
  ) t, analysis_tmp.region r, analysis_tmp.sssi x
  where st_intersects(t.geom, r.geom)
) d
where st_area(d.out) > 1e4
order by st_area(d.out) desc;

drop schema analysis_tmp cascade;
SQL
