/**
 * Load open data layers into the private `layers` schema in PostGIS.
 *
 *   npm run load-layers                      # default region, all layers
 *   npm run load-layers -- --region <id>     # another config/regions/<id>.json
 *   npm run load-layers -- --only sssi,peat_status
 *   npm run load-layers -- --refresh         # re-download even if raw files exist
 *
 * For each layer: download the features inside the region's bounding box
 * from the publisher's ArcGIS service (GDAL in Docker) to
 * data/raw/<region>/<layer>.gpkg, load into layers_staging, then clip to the
 * region, split large polygons (ST_Subdivide) and replace that layer's rows
 * in layers.features. Safe to re-run.
 *
 * DATABASE_URL defaults to the local Supabase database. For the hosted
 * database use the Session pooler connection string (IPv4, supports COPY).
 * The password is passed to GDAL through the environment, never on the
 * command line, and remote connections are encrypted.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const GDAL_IMAGE = "ghcr.io/osgeo/gdal:ubuntu-small-3.13.3";
const PAGE_SIZE = 1000;
const SUBDIVIDE_MAX_VERTICES = 256;

const ROOT = path.resolve(__dirname, "..");
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

type Region = {
  id: string;
  name: string;
  boundary: { service: string; where: string; code?: string; source: string; attribution: string };
};

type Layer = {
  id: string;
  name: string;
  category: string;
  publisher: string;
  service: string;
  /** Further layers of the same dataset (e.g. Living England's zones), merged into one. */
  extra_services?: string[];
  /** Attribute filter applied at download, e.g. only some classes. */
  where?: string;
  info_url?: string;
  version?: string;
  licence: string;
  licence_url?: string;
  attribution: string;
  class_field?: string;
  name_field?: string;
  notes?: string;
};

type Bbox = { xmin: number; ymin: number; xmax: number; ymax: number };

function parseArgs() {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    region: value("--region") ?? "cambridgeshire-and-peterborough",
    only: value("--only")?.split(",").map((s) => s.trim()),
    refresh: args.includes("--refresh"),
  };
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, file), "utf8")) as T;
}

const dbUrl = new URL(DATABASE_URL);
const IS_LOCAL_DB = ["127.0.0.1", "localhost"].includes(dbUrl.hostname);

// GDAL runs in Docker, so a database on this machine is reached via
// host.docker.internal rather than localhost. No password here: see gdal().
function gdalDatabaseUrl(): string {
  const host = IS_LOCAL_DB ? "host.docker.internal" : dbUrl.hostname;
  return `PG:dbname=${dbUrl.pathname.slice(1)} host=${host} port=${dbUrl.port || 5432} user=${decodeURIComponent(dbUrl.username)}`;
}

function gdal(rawDir: string, args: string[]) {
  execFileSync(
    "docker",
    [
      "run", "--rm",
      "-v", `${rawDir}:/data`,
      // Values come from the docker CLI's own environment (below), so the
      // password never appears in the process list or in error messages.
      "-e", "PGPASSWORD",
      "-e", "PGSSLMODE",
      "-e", "OGR_ORGANIZE_POLYGONS=ONLY_CCW",
      // Retry pages that time out or fail; a long download should not die on one blip.
      "-e", "GDAL_HTTP_MAX_RETRY=5",
      "-e", "GDAL_HTTP_RETRY_DELAY=10",
      "-e", "GDAL_HTTP_TIMEOUT=180",
      "-e", "CPL_LOG=/dev/null",
      GDAL_IMAGE,
      ...args,
    ],
    {
      stdio: ["ignore", "inherit", "inherit"],
      env: {
        ...process.env,
        PGPASSWORD: decodeURIComponent(dbUrl.password),
        PGSSLMODE: IS_LOCAL_DB ? "disable" : "require",
      },
    },
  );
}

function queryUrl(service: string, params: Record<string, string>): string {
  const q = new URLSearchParams({ outFields: "*", outSR: "27700", f: "json", ...params });
  return `${service}/query?${q}`;
}

function envelopeParams(b: Bbox): Record<string, string> {
  return {
    where: "1=1",
    geometry: `${b.xmin},${b.ymin},${b.xmax},${b.ymax}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "27700",
    spatialRel: "esriSpatialRelIntersects",
  };
}

async function expectedCount(service: string, params: Record<string, string>): Promise<number> {
  const res = await fetch(queryUrl(service, { ...params, returnCountOnly: "true" }));
  const body = (await res.json()) as { count?: number; error?: unknown };
  if (typeof body.count !== "number") throw new Error(`Count failed for ${service}: ${JSON.stringify(body)}`);
  return body.count;
}

/** Download to <rawDir>/<name>.gpkg unless it already exists. Several URLs are appended into one layer. */
function download(rawDir: string, name: string, url: string | string[], refresh: boolean): { at: Date; fresh: boolean } {
  const file = path.join(rawDir, `${name}.gpkg`);
  if (existsSync(file) && !refresh) {
    console.log(`  using existing data/raw/.../${name}.gpkg`);
    return { at: statSync(file).mtime, fresh: false };
  }
  const partial = path.join(rawDir, `${name}.part.gpkg`);
  rmSync(partial, { force: true });
  console.log(`  downloading ${name} ...`);
  const urls = Array.isArray(url) ? url : [url];
  urls.forEach((u, i) => {
    gdal(rawDir, [
      "ogr2ogr", "-f", "GPKG", `/data/${name}.part.gpkg`,
      `ESRIJSON:${u}`,
      // Always polygons. Stating the type matters when appending: a layer
      // created from an empty first response would otherwise have no
      // geometry column, and later pages would silently lose their shapes.
      "-nln", name, "-nlt", "MULTIPOLYGON", "-a_srs", "EPSG:27700",
      ...(i > 0 ? ["-update", "-append"] : []),
    ]);
  });
  renameSync(partial, file);
  return { at: new Date(), fresh: true };
}

function loadToStaging(rawDir: string, name: string) {
  gdal(rawDir, [
    "ogr2ogr", "-f", "PostgreSQL", gdalDatabaseUrl(), `/data/${name}.gpkg`,
    "-nln", `layers_staging.${name}`, "-overwrite",
    "-lco", "GEOMETRY_NAME=geom", "-lco", "FID=ogc_fid", "-lco", "SPATIAL_INDEX=NONE",
    "-nlt", "PROMOTE_TO_MULTI", "-t_srs", "EPSG:27700",
  ]);
}

async function loadRegion(db: Client, region: Region, rawDir: string, refresh: boolean): Promise<Bbox> {
  console.log(`Region: ${region.name}`);
  const name = "region_boundary";
  download(rawDir, name, queryUrl(region.boundary.service, { where: region.boundary.where }), refresh);
  loadToStaging(rawDir, name);
  await db.query(
    `insert into layers.regions (id, name, source_url, source_code, loaded_at, geom)
     select $1, $2, $3, $4, now(),
            st_multi(st_collectionextract(st_makevalid(st_union(geom)), 3))
     from layers_staging.${name}
     on conflict (id) do update set name = excluded.name, source_url = excluded.source_url,
       source_code = excluded.source_code, loaded_at = excluded.loaded_at, geom = excluded.geom`,
    [region.id, region.name, region.boundary.service, region.boundary.code ?? null],
  );
  await db.query(`drop table layers_staging.${name}`);
  const { rows } = await db.query(
    `select st_xmin(geom) xmin, st_ymin(geom) ymin, st_xmax(geom) xmax, st_ymax(geom) ymax,
            round((st_area(geom) / 1e6)::numeric, 1) km2
     from layers.regions where id = $1`,
    [region.id],
  );
  console.log(`  boundary loaded: ${rows[0].km2} km²`);
  return rows[0];
}

async function loadLayer(db: Client, layer: Layer, region: Region, bbox: Bbox, rawDir: string, refresh: boolean) {
  const started = Date.now();
  console.log(`\n${layer.name} (${layer.id})`);
  const params = { ...envelopeParams(bbox), ...(layer.where ? { where: layer.where } : {}) };
  const allServices = [layer.service, ...(layer.extra_services ?? [])];
  // Skip parts of a multi-layer dataset with nothing in this region.
  const services =
    allServices.length === 1
      ? allServices
      : (await Promise.all(allServices.map(async (svc) => ((await expectedCount(svc, params)) > 0 ? svc : null)))).filter(
          (svc): svc is string => svc !== null,
        );
  const urls = services.map((svc) => queryUrl(svc, { ...params, resultRecordCount: String(PAGE_SIZE) }));
  const { at: downloadedAt, fresh } = download(rawDir, layer.id, urls, refresh);

  loadToStaging(rawDir, layer.id);
  const staged = Number((await db.query(`select count(*) from layers_staging.${layer.id}`)).rows[0].count);
  // A fresh download must contain every feature the service says matches.
  if (fresh) {
    let expected = 0;
    for (const svc of services) expected += await expectedCount(svc, params);
    if (staged !== expected) {
      throw new Error(`${layer.id}: downloaded ${staged} features but the service reports ${expected}`);
    }
  }
  console.log(`  ${staged} features in the region's bounding box`);

  const classExpr = layer.class_field ? `nullif(trim(attrs ->> '${layer.class_field}'), '')` : "null";
  const nameExpr = layer.name_field ? `nullif(trim(attrs ->> '${layer.name_field}'), '')` : "null";

  await db.query("begin");
  try {
    await db.query(
      `insert into layers.sources (id, name, category, publisher, service_url, info_url, version,
         licence, licence_url, attribution, notes, downloaded_at, loaded_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
       on conflict (id) do update set name = excluded.name, category = excluded.category,
         publisher = excluded.publisher, service_url = excluded.service_url,
         info_url = excluded.info_url, version = excluded.version, licence = excluded.licence,
         licence_url = excluded.licence_url, attribution = excluded.attribution,
         notes = excluded.notes, downloaded_at = excluded.downloaded_at, loaded_at = now()`,
      [layer.id, layer.name, layer.category, layer.publisher, layer.service, layer.info_url ?? null,
       layer.version ?? null, layer.licence, layer.licence_url ?? null, layer.attribution,
       layer.notes ?? null, downloadedAt],
    );
    await db.query("delete from layers.features where layer_id = $1 and region_id = $2", [layer.id, region.id]);
    // Cut each feature to the region's bounding box (+1 km) first: fast, and
    // fine on invalid input. Then repair it, clip exactly to the region
    // (skipping the clip when a feature is wholly inside), and split into
    // pieces of at most N vertices. Box-clipping first matters for giant
    // national polygons: one Low Sensitivity v4 feature has 747,475 vertices,
    // 99.6% outside the region, and repairing it whole took 11 s locally and
    // killed the session on the free hosted tier.
    const { rowCount } = await db.query(
      `with r as (select geom, st_expand(geom::box2d, 1000) as box from layers.regions where id = $2),
       src as (
         select s.ogc_fid::text as fid,
                to_jsonb(s) - 'geom' - 'ogc_fid' as attrs,
                st_collectionextract(st_makevalid(st_clipbybox2d(s.geom, r.box)), 3) as g
         from layers_staging.${layer.id} s, r
         where s.geom && r.box
       ),
       clipped as (
         select fid, attrs,
                case when st_coveredby(src.g, r.geom) then src.g
                     else st_collectionextract(st_intersection(src.g, r.geom), 3) end as g
         from src, r
         where st_intersects(src.g, r.geom)
       ),
       pieces as (
         select fid, attrs, (st_dump(st_subdivide(g, ${SUBDIVIDE_MAX_VERTICES}))).geom as g
         from clipped
         where not st_isempty(g)
       )
       insert into layers.features (layer_id, region_id, source_fid, class, name, attributes, geom)
       select $1, $2, fid, ${classExpr}, ${nameExpr}, attrs, g
       from pieces
       where st_geometrytype(g) = 'ST_Polygon' and st_area(g) > 0`,
      [layer.id, region.id],
    );
    await db.query(`drop table layers_staging.${layer.id}`);
    await db.query("commit");
    console.log(`  ${rowCount} pieces stored after clipping and subdividing (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  } catch (err) {
    await db.query("rollback");
    throw err;
  }
}

async function main() {
  const opts = parseArgs();
  const region = readJson<Region>(`config/regions/${opts.region}.json`);
  const layers = readJson<Layer[]>("config/layers.json").filter(
    (l) => !opts.only || opts.only.includes(l.id),
  );
  if (opts.only && layers.length !== opts.only.length) {
    throw new Error(`Unknown layer id in --only: ${opts.only.join(", ")}`);
  }

  const rawDir = path.join(ROOT, "data", "raw", region.id);
  mkdirSync(rawDir, { recursive: true });

  const db = new Client({
    host: dbUrl.hostname,
    port: Number(dbUrl.port || 5432),
    database: dbUrl.pathname.slice(1),
    user: decodeURIComponent(dbUrl.username),
    password: decodeURIComponent(dbUrl.password),
    // Encrypt remote connections. Supabase's pooler certificate is not from a
    // public CA, so this is "require" (encrypted) rather than full verification.
    ssl: IS_LOCAL_DB ? false : { rejectUnauthorized: false },
    // If the server side of the connection dies (e.g. a pooled session is
    // killed), fail instead of waiting forever for a reply that never comes.
    keepAlive: true,
    query_timeout: 30 * 60 * 1000,
  });
  await db.connect();
  // Clipping big layers can take minutes on a small server; never time out the loader.
  await db.query("set statement_timeout = 0");
  console.log(`Database: ${IS_LOCAL_DB ? "local" : dbUrl.hostname}`);
  try {
    const bbox = await loadRegion(db, region, rawDir, opts.refresh);
    for (const layer of layers) {
      await loadLayer(db, layer, region, bbox, rawDir, opts.refresh);
    }
    await db.query("analyze layers.features");
    const { rows } = await db.query(
      `select layer_id, count(*) pieces, count(distinct source_fid) features,
              round((sum(st_area(geom)) / 1e4)::numeric) ha
       from layers.features where region_id = $1 group by layer_id order by layer_id`,
      [region.id],
    );
    console.log("\nLoaded:");
    console.table(rows);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
