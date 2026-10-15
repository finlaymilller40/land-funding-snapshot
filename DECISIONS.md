# Decisions

A log of design and technical decisions. Newest phase at the bottom. Each entry
records the date, what was decided, why, and the alternatives considered.

## Phase 0: empty pipeline (Next.js → Supabase → Vercel)

### D1. Local development with the Supabase CLI and Docker
- **Date:** 2026-10-13
- **What:** Run Supabase locally in Docker via the Supabase CLI. Database
  changes are SQL migrations in `supabase/migrations/`, committed to git, and
  pushed to the hosted project.
- **Why:** A safe sandbox to try changes before they reach the live database,
  and a versioned, reviewable history of every schema change.
- **Alternatives:** Cloud-only (apply migrations straight to the hosted
  project). Quicker to start, but every test hits the real database.

### D2. New repository, separate from the earlier prototype
- **Date:** 2026-10-13
- **What:** Build in its own folder and git history
  (`~/Documents/land-funding-snapshot`), not inside `mozaic-nature-snapshot`.
- **Why:** That folder is a finished Python/FastAPI project with its own
  README, DECISIONS and app code. Mixing them would make both confusing.
- **Alternatives:** A subfolder of the existing repo, or replacing its contents.

### D3. Supabase CLI installed as a project dev dependency
- **Date:** 2026-10-13
- **What:** `npm install -D supabase`, run with `npx supabase …`.
- **Why:** The version is pinned in `package.json`, so anyone cloning the repo
  gets the same CLI. No global install or admin password needed.
- **Alternatives:** Homebrew (global `supabase` command; Homebrew is not
  installed on this machine).

### D4. Next.js scaffold options
- **Date:** 2026-10-13
- **What:** Next.js 16.4, TypeScript, App Router, ESLint, Tailwind CSS, code in
  `src/`, import alias `@/*`, `AGENTS.md` included. React Compiler off. Kept the
  scaffold's defaults of Turbopack and Cache Components.
- **Why:** Tailwind is a styling toolkit rather than a component library, and is
  standard for Next.js on Vercel. `src/` keeps app code apart from config and the
  `supabase/` folder. `AGENTS.md` points AI coding tools at the current Next.js
  docs. React Compiler is unnecessary at this size, so the scaffold stays minimal.
- **Alternatives:** Plain CSS / CSS Modules; top-level `app/` folder; React
  Compiler on.

### D5. Row-level security on every table from day one
- **Date:** 2026-10-13
- **What:** `health_check` has RLS enabled with a single policy allowing
  `select` to `anon` and `authenticated`. There are no insert, update or delete
  policies, and those table privileges are also revoked from the API roles.
- **Why:** Security by default. The anon key is public (it ships to browsers),
  so the database itself must enforce who can do what. Verified locally: reads
  succeed, writes return "permission denied".
- **Alternatives:** RLS with no policies (unreadable with the anon key, which
  would force use of the service role key); no RLS (anyone with the anon key
  could change data).

### D6. PostGIS in the `extensions` schema
- **Date:** 2026-10-13
- **What:** `create extension postgis with schema extensions`.
- **Why:** Supabase's recommended layout: keeps PostGIS's many functions and
  tables out of `public`, which is exposed through the API.
- **Alternatives:** Install into `public` (the Postgres default).

### D7. Server-side read, fresh on every visit
- **Date:** 2026-10-13
- **What:** The home page is a Server Component. The database read sits in a
  child component inside `<Suspense>` and calls `connection()`, so it runs on
  every request. The heading is prerendered; the row streams in.
- **Why:** The point of Phase 0 is proving the live site talks to the live
  database. Next.js 16.4 (Cache Components) requires request-time data to be
  wrapped in `<Suspense>` or explicitly marked as blocking.
- **Alternatives:** Fetch in the browser (client-side); fetch at build time
  (bakes the row into the page, proving nothing); a fully blocking route
  (`export const instant = false`).

### D8. Environment variables and keys
- **Date:** 2026-10-13
- **What:** The app uses only `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, stored in `.env.local` locally and in Vercel's
  environment settings in production. `.env*` is git-ignored. The service role
  key is never used in app code or committed.
- **Why:** The anon key is designed to be public and is constrained by RLS. The
  service role key bypasses RLS entirely.
- **Alternatives:** Supabase's newer "publishable key" (`sb_publishable_…`),
  which plays the same role; a committed `.env.example` (not added in Phase 0;
  the README lists the variables instead).

### D9. Plain `@supabase/supabase-js` client for now
- **Date:** 2026-10-13
- **What:** One shared client in `src/lib/supabase.ts`, with session storage off.
- **Why:** There is no login yet, so no cookies or sessions to manage.
- **Alternatives:** `@supabase/ssr`, which handles auth cookies across server
  and browser. Revisit when Supabase Auth is added.

### D10. Dev-only `npm audit` warnings left as they are
- **Date:** 2026-10-13
- **What:** Did not run `npm audit fix --force`.
- **Why:** The 5 high-severity warnings are in ESLint's dependency tree
  (`braces` via `eslint-config-next`), which runs only on developer machines and
  is not shipped to the site. The forced "fix" would downgrade the Next.js lint
  config to v14.
- **Alternatives:** Force the fix (breaks linting); add an npm `overrides` pin.

### D11. Explicit anon grant for the hosted project
- **Date:** 2026-10-15
- **What:** The hosted Supabase project has "Automatically expose new tables"
  off and automatic RLS on. A separate migration grants `SELECT` on
  `public.health_check` to `anon` and nothing else.
- **Why:** With auto-expose off, API roles get no table privileges unless
  granted. RLS policies only filter rows a role is already allowed to touch, so
  the read-only policy needs a matching grant. Keeping it as its own migration
  makes the requirement explicit. Tested locally by revoking all `anon`
  privileges, applying only this migration, and confirming reads succeed and
  writes are refused.
- **Alternatives:** Rely on the grant already in the first migration; turn
  auto-expose on (every new table becomes reachable by default).

### Phase 0 complete
- **Date:** 2026-10-15
- **Result:** The live site at https://land-funding-snapshot-snd5.vercel.app
  displays the `health_check` row read from the hosted Supabase database
  (row 1, created 2026-10-15 16:57:53 UTC, matching the hosted migration
  push rather than the local database). Next.js → Supabase → Vercel works end
  to end, with RLS on and only the URL and anon key in the front end.

## Phase 1: open data layers in PostGIS

### D12. Fetch only the region from each publisher's ArcGIS service
- **Date:** 2026-10-15
- **What:** For each layer, query the official ArcGIS Feature Service for
  features intersecting the region's bounding box, then clip exactly in
  PostGIS. A fresh download is checked against the service's own feature count.
- **Why:** About 235 MB for Cambridgeshire and Peterborough instead of
  several GB of national files. The same script works for any region,
  including all of England (slower, but no code change).
- **Alternatives:** Download full national files and clip locally.

### D13. TypeScript loader driving GDAL in Docker
- **Date:** 2026-10-15
- **What:** `scripts/load_layers.ts` (run with `npm run load-layers`, via
  `tsx`) calls `ogr2ogr` from the pinned image
  `ghcr.io/osgeo/gdal:ubuntu-small-3.13.3`, and runs SQL through `pg`. HTTP
  requests are retried up to 5 times, after one long Peat Status download
  failed partway through.
- **Why:** One language across the repo. GDAL is the standard tool for reading
  ArcGIS services, reprojecting and writing to PostGIS, and Docker avoids
  installing it locally. Pinning the image keeps runs reproducible.
- **Alternatives:** A Python script driving GDAL in Docker; Python with
  geopandas, as in the earlier prototype. That needs a virtualenv, and this
  Mac's python.org build is missing its SSL certificates.

### D14. Layer versions
- **Date:** 2026-10-15
- **What:** EWCO Priority Habitat Network: the "Nature Recovery" version
  (Premium / High / Lower spatial priority). Low Sensitivity Map v5.0. National
  Forest Inventory England 2025. SSSIs as whole-site boundaries.
- **Why:** The latest published versions, and the ones EWCO currently uses.
  Site boundaries are enough to flag an SSSI.
- **Alternatives:** The older "Biodiversity" Priority Habitat Network; Low
  Sensitivity Map v3/v4; NFI 2023; SSSI Units.

### D15. Load England Peat Status despite its non-commercial licence
- **Date:** 2026-10-15
- **What:** Loaded, with the Non-Commercial Government Licence v2.0 and a
  "NON-COMMERCIAL USE ONLY" note recorded in `layers.sources`.
- **Why:** Fine for a portfolio prototype. Any paid use would need permission
  or another peat dataset.
- **Alternatives:** Leave peat out; use a different peat source.

### D16. One shared features table, one overlap function
- **Date:** 2026-10-15
- **What:** All layers go into `layers.features` (layer id, region id,
  `class`, `name`, full source `attributes` as JSON, Polygon geometry in
  EPSG:27700). `class` is the attribute rules will use: peat `PSL`, ALC
  `ALC_GRADE`, PHI `MainHabs`, the EWCO category fields, NFI `CATEGORY`.
  `layers.site_overlaps(geometry)` returns each layer and class a site overlaps,
  with the area in hectares. It accepts any SRID and unions pieces within a
  layer first, so overlapping features aren't double counted.
- **Why:** One indexed query answers "which layers does this site touch"
  however many layers are added.
- **Alternatives:** One table per layer; per-layer tables plus a shared view.

### D17. Region as config; boundary downloaded, not committed
- **Date:** 2026-10-15
- **What:** `config/regions/<id>.json` holds the region name plus the ONS
  service and code (Combined Authorities December 2025, full resolution,
  E47000008). The loader downloads the boundary into `data/raw/<region>/`,
  which git ignores.
- **Why:** No data files in git. Covering a new region, or all of England,
  needs only a new config file.
- **Alternatives:** Commit the boundary GeoJSON (about 1 MB).

### D18. GeoPackage for raw downloads
- **Date:** 2026-10-15
- **What:** Each layer is saved as `data/raw/<region>/<layer>.gpkg`.
- **Why:** Compact, one file per layer, keeps data types and coordinate system.
- **Alternatives:** GeoJSON (readable but larger and untyped).

### D19. Loader implementation details
- **Date:** 2026-10-15
- **What:**
  - Raw loads land in a `layers_staging` schema, which is also private, and
    are dropped after each layer.
  - Geometries are repaired (`ST_MakeValid`), clipped to the region (skipped
    when a feature is wholly inside), and split with `ST_Subdivide` at 256
    vertices.
  - Each layer is replaced in one transaction, so a failed run leaves the
    previous data intact.
  - Raw files are reused unless `--refresh` is passed. `layers.sources` has one
    row per layer, with `downloaded_at` set from the latest download.
  - RLS is on for every `layers` table with no policies. Execute on
    `site_overlaps` is revoked from API roles.
- **Why:** Re-runnable and safe, fast lookups, and private by default.
- **Alternatives:** Temporary tables; other subdivide sizes (more vertices
  means fewer, larger pieces and slower intersections).

### Phase 1 test results (local)
- **Date:** 2026-10-15
- **Data:** 12 layers, about 90,000 pieces, 141 MB in Postgres.
- **Test sites:** three 300 m squares (9 ha), in `scripts/sql/test_overlaps.sql`.
  - **Clearly fine** (between Spaldwick and Ellington): ALC Grade 3 and EWCO
    layers only; no hard constraints. 2.7 ms.
  - **Brampton Wood SSSI:** SSSI 9 ha, Priority Habitat deciduous woodland
    8.2 ha, NFI woodland. 1.5 ms.
  - **Fen east of Ramsey:** Deep Peaty Soils 9 ha, ALC Grade 1 9 ha. 0.7 ms.
- **Larger sites:** 500 ha took about 11 ms and 2,000 ha about 53 ms. The
  spatial index (`features_geom_idx`) is used.
