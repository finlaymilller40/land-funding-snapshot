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

## Phase 2: EWCO rules engine

### D20. Rules checked against gov.uk; where they differ from the brief
- **Date:** 2026-10-15
- **What:** Checked the [EWCO guidance](https://www.gov.uk/guidance/england-woodland-creation-offer)
  (updated 11 Aug 2026) and [Additional contributions](https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco)
  (updated 5 Oct 2026). All rates match the brief. Differences recorded as
  limitations in `rules.messages`:
  - SSSI, Priority Habitat, Scheduled Monuments (+20 m) and deep peat are not
    listed as ineligible on these pages. They are kept as screening
    exclusions from wider woodland creation rules and labelled that way.
  - Developed land and hard standing are ineligible, but not mapped.
  - Up to 10% may sit outside the low sensitivity area (map v4.0 variant 3)
    if the only sensitivity there is agricultural grade. Not applied.
  - Minimum width is 20 m (10 m for riparian buffers and shelterbelts). Not
    checked.
  - Recreational access can't be paid on CRoW or existing access land. Not
    checked.
  - Red squirrel lower-tier nature recovery is not assessed.
- **Why:** The brief asked for differences to be flagged, and users should see
  what the screen can't check.

### D21. Low Sensitivity Map v4.0 for the payment, v5.0 kept
- **Date:** 2026-10-15
- **What:** Loaded `ewco_low_sensitivity_v4` (45,124 ha in the region) and
  pointed the low sensitivity rate at it. v5.0 (`ewco_low_sensitivity`,
  44,291 ha) stays loaded for reference.
- **Why:** gov.uk names v4.0 for the payment.
- **Alternatives:** Use v5.0, the latest map, but not the one named.

### D22. screen_site() is open to anon, with abuse limits
- **Date:** 2026-10-15
- **What:** `public.screen_site(site jsonb, public_access boolean)` is
  `SECURITY DEFINER` with a pinned `search_path`. Execute is granted to
  `anon` and `authenticated` only. The `rules` and `layers` schemas and their
  functions stay private. Limits, all stored in `rules.settings`: at most 50
  blocks, 2,000 ha drawn, and the whole site inside a loaded region. I also
  reject overlapping blocks, which wasn't asked for, so area isn't counted
  twice. Errors come back as HTTP 400 with a plain message.
- **Why:** No login exists yet. Running with the owner's rights lets it read
  layers while returning only results.
- **Alternatives:** `authenticated` only; no limits.

### D23. Input as GeoJSON, output as one JSON document
- **Date:** 2026-10-15
- **What:** Input is a GeoJSON `FeatureCollection` in lon/lat, one Polygon or
  MultiPolygon per block, with an optional `properties.name`. Output is a
  single JSON document with `summary`, `income` (one-off list and total,
  annual maintenance with its 15-year total, overall total),
  `costs_covered`, `blocks`, `site_flags`, `limitations`, `rates_checked`
  and `sources`.
- **Why:** It matches what a map drawing tool produces and what the website
  and AI explainer will consume.
- **Alternatives:** Arrays of PostGIS geometries; table rows per block per
  payment.

### D24. "Touches" and flags are tested on the eligible part of each block
- **Date:** 2026-10-15
- **What:** Payment layers must touch the block after removals. Flags (shallow
  or patchy peat, ALC Grade 1/2) are measured on the same eligible area.
- **Why:** Removed land won't be planted, so it isn't part of the compartment.
  Applying the same idea to flags was my choice. As a result, a block that is
  entirely removed (e.g. the fen test site, all deep peat) shows no
  Grade 1 flag.
- **Alternatives:** Test the block as drawn.

### D25. Removal reasons in priority order
- **Date:** 2026-10-15
- **What:** Each square metre is credited to the first exclusion that covers
  it: SSSI, Scheduled Monument (+20 m), Priority Habitat, deep peat, existing
  woodland (NFI `Woodland` class only). Order and buffers are in
  `rules.ewco_exclusions`.
- **Why:** The per-reason figures then add up to the total removed.
- **Alternatives:** Report each reason's full overlap, which can add up to
  more than the total.

### D26. Low sensitivity tolerance for edge slivers
- **Date:** 2026-10-15
- **What:** The whole eligible proposal counts as inside the low sensitivity
  map if no more than 0.5% of it, or 100 m², whichever is smaller, falls
  outside.
- **Why:** Different maps rarely line up exactly at their edges.
- **Alternatives:** Strictly 100%.

### D27. Rules as data in a private `rules` schema
- **Date:** 2026-10-15
- **What:**
  - `rules.ewco_rates`: payment name, kind (one-off / annual / costs
    covered), £ rate, unit, years, layer and qualifying classes,
    qualification method (touches / area inside / whole site inside /
    eligible area), exclusive group, public access requirement,
    prerequisite payment, design condition, source URL, date checked.
  - I also moved exclusions, flags, settings and all wording into tables
    (`ewco_exclusions`, `ewco_flags`, `settings`, `messages`), so the
    function contains no rates, thresholds or explanation text.
  - Layer ids aren't foreign keys, because `layers.sources` is filled by the
    loader after migrations run. The tests check every referenced layer
    exists.
  - RLS is on for all tables, with no policies.
- **Why:** Rates and rules can change without touching code, and every number
  carries its source and the date it was checked.
- **Alternatives:** Only rates in a table, with the rest in the function.

### D28. Engine details
- **Date:** 2026-10-15
- **What:**
  - **Rounding:** hectares are shown to 2 decimal places. Each payment is
    rounded to whole pounds per block, and totals are sums of those.
    Maintenance's 15-year total is the rounded yearly amount × 15.
  - **Order:** prerequisites are evaluated first (close to settlements before
    recreational access), then the highest rate, so nature recovery keeps
    its top tier.
  - **Below-minimum blocks:** blocks under 0.1 ha are flagged and left out of
    the site's 1 ha total and the payments. Below 1 ha, the site gets a flag
    and no payments.
  - **Slivers:** overlaps under 1 m² are ignored.
  - **Missed payments:** if public access is answered "no", recreational
    access is listed under `not_applied` with what it would have been worth.
    This wasn't asked for.
- **Why:** Predictable figures, and a clear "what you're missing".

### Phase 2 test results (local)
- **Date:** 2026-10-15
- `scripts/sql/test_screen_site.sql` compares 91 hand-worked values (gov.uk
  rates applied to raw overlaps from `layers.site_overlaps`) with
  `screen_site()` output. **91 pass, 0 missing or unexpected.** Calls take
  7 to 160 ms; the first call on a cold cache is the slowest.
- Sites:
  1. Clearly fine (9 ha): £31,871 one-off, £3,600 a year, £85,871 total, up
     to £91,800 costs covered.
  2. Brampton Wood SSSI: all 9 ha removed, below minimum, £0.
  3. Fen east of Ramsey: all 9 ha deep peat, below minimum, £0.
  4. Riparian site, with and without public access: £123,596 or £90,296.
  5. SSSI edge: 4.23 ha removed, 4.77 ha eligible, plus a 0.06 ha block
     flagged as below minimum. £33,832.
- Via the REST API with the anon key: `screen_site` works; `rules` and
  `layers` are unreachable; bad input returns HTTP 400 with a clear message.
- All four migrations apply cleanly to an empty database, followed by a full
  reload of the layers.

## Phase 3: website front end

### D29. Libraries
- **Date:** 2026-10-16
- **What:**
  - MapLibre GL 6.14 for the map.
  - Terra Draw 1.37 with its MapLibre adapter for drawing and editing fields.
  - `@turf/area` and `@turf/difference` for live areas and the outside-region
    check.
  - postcodes.io for postcode search.
  - Tailwind for styling, and the Supabase client for `rpc()` calls with the
    anon key.
  - No component library, state library, AI, accounts or saving.
- **Why:** These were the agreed defaults. Terra Draw is built for MapLibre,
  whereas Mapbox GL Draw needs workarounds.
- **Alternatives:** Mapbox GL Draw.

### D30. Basemap with an optional aerial photo
- **Date:** 2026-10-16
- **What:** The OpenFreeMap "Positron" style (no key) is the default. An
  "Aerial photo" checkbox switches on Esri World Imagery, with attribution.
- **Why:** Farmers trace field edges far more easily on aerial imagery. Esri's
  terms allow non-commercial and prototype use; a commercial product would
  need an Esri account.
- **Alternatives:** Street map only; Sentinel-2 imagery (open, but 10 m pixels
  are blurry at field scale).

### D31. Region outline and result shapes from the database
- **Date:** 2026-10-16
- **What:** Migration `20261015232311` adds two things:
  - `public.region_outline()`: a simplified (10 m) outline of loaded regions,
    66 KB.
  - Shapes in `screen_site()`'s result: per block, the eligible area and each
    removed area as 1 m-simplified lon/lat GeoJSON.

  Both are `SECURITY DEFINER`, executable by anon. Simplification tolerances
  are stored in `rules.settings`. The tests check that the returned shapes'
  areas match the reported hectares (within 0.02 ha).
- **Why:** The browser must never read layers. Result shapes are clipped to
  the user's own fields, so they reveal nothing beyond land the user drew.
- **Alternatives:** A static outline file committed to the repo; numbers only,
  with no results map.

### D32. One page, three steps, held in memory
- **Date:** 2026-10-16
- **What:** `/check` holds the map, question and results steps in React state.
  The browser's back and forward buttons move between steps. The map step
  stays mounted (hidden) so drawn fields survive. Refreshing starts over.
- **Why:** Simplest option with no saving yet.
- **Alternatives:** A URL per step with session storage.

### D33. Look and feel
- **Date:** 2026-10-16
- **What:**
  - The device's system font.
  - Muted earthy tokens in `globals.css`. Text contrast: ink 14.5:1, moss
    9.0:1, muted 6.0:1, clay text 6.0:1. Sage and clay are used only as fills.
  - Light theme only, like gov.uk.
  - Fields are outlined in ochre so they stay visible on the aerial photo.
  - A focus ring (black outline with a yellow halo) on everything
    keyboard-reachable; headings focused by the page don't show it.
  - Tap targets are at least 44 px. Step headings and errors receive focus so
    screen readers announce them.
- **Why:** Calm, plain and accessible, at gov.uk-level clarity.

### D34. Honest money display
- **Date:** 2026-10-16
- **What:**
  - Headline figures are rounded to the nearest £100 and labelled "about".
    Payment cards show exact amounts.
  - One-off and yearly payments sit side by side, with the 15-year total
    underneath.
  - "Costs covered (not income)" is a separate dashed panel and is never added
    to income.
  - Below 1 ha plantable, no money is shown at all.
  - Headings use plain English ("Riverside shade bonus"); scheme terms
    ("EWCO additional contribution: riparian buffers") sit in each card's
    detail.
- **Why:** It's an estimate, and false precision undermines trust.

### D35. Implementation notes
- **Date:** 2026-10-16
- **What:**
  - **MapLibre worker:** MapLibre 6 loads its web worker from a file next to
    its bundle, which Next.js moves. `scripts/copy-maplibre-worker.mjs` copies
    it to `public/vendor/` (git-ignored) before `dev` and `build`, and
    `setWorkerUrl` points to it.
  - **Map handle:** `next/dynamic` doesn't forward refs, so the map's handle
    is passed as an ordinary prop.
  - **Areas in the browser:** they come from Turf's spherical maths, which is
    about 0.3% below the database's British Grid figure (8.97 vs 9.00 ha). The
    map step labels them "about"; results always show the database's numbers.
  - **Uploaded MultiPolygons:** Terra Draw only edits single Polygons, so
    these are shown and screened, and can be renamed or deleted, but not
    reshaped.
  - **Drawing accessibility:** drawing needs a mouse or touch screen. Upload
    is the keyboard-accessible alternative, and the page says so.
- **Why:** Recorded so these quirks aren't rediscovered later.

### Phase 3 test results (local)
- **Date:** 2026-10-16
- All five Phase 2 test sites were uploaded and screened through the UI. Every
  figure matches the database test:
  1. Fine site: about £31,900 one-off, about £3,600 a year, about £85,900
     total, costs covered up to about £91,800.
  2. Brampton Wood: 0 ha plantable, no money shown.
  3. Fen site: 0 ha plantable, no money shown.
  4. Riparian site: about £69,600 one-off with public access, or about
     £36,300 without, plus "Allowing public access would add £33,300".
  5. SSSI edge: 4.77 ha plantable, with the map split along the SSSI boundary.
     The 0.06 ha block is marked "not paid".
- Also checked:
  - Hand-drawing with live area, Enter to finish, and the aerial photo.
  - Postcode search, found and not found.
  - The outside-region warning blocking Continue.
  - The overlap error from the server, and the unanswered question.
  - Back to map, and the browser Back button.
  - Phone width (375 px): no sideways scrolling, 44 px tap targets.
  - The production build.

## Hosted database preparation

### D36. Database size and the free tier
- **Date:** 2026-10-16
- **What:** Local database: 161–163 MB in total. The `layers` schema is
  141 MB (120 MB table data, 13 MB large-value storage, 7.5 MB indexes),
  `rules` is 0.2 MB, and everything else about 20 MB. Stay on the free tier
  for Cambridgeshire and Peterborough.
- **Why:** The free tier allows 500 MB per project, and the project becomes
  read-only above that. We use about 33%. Egress (5 GB a month) and the
  3-second anon timeout are also fine: the worst case, a 2,000 ha site, took
  260 ms locally. There are no other Supabase projects in the organisation.
- **Alternatives:** Pro plan ($25/month, 8 GB). All of England would be roughly
  5–6 GB at this density, so it would need Pro or a slimmer layout (e.g.
  dropping the full-attribute JSON and the reference-only Low Sensitivity
  v5.0).

### D37. Loader hardening for a remote database
- **Date:** 2026-10-16
- **What:**
  - The database password reaches GDAL through the Docker CLI's environment
    (`-e PGPASSWORD`), not the command line, so it never appears in the
    process list or in error messages. Checked with 60 process-list samples
    during a load.
  - Remote connections are encrypted (`sslmode=require`). This means
    encrypted but not certificate-verified, because Supabase's pooler
    certificate isn't from a public certificate authority.
  - The loader's own session has `statement_timeout = 0`.
  - `scripts/sql/verify_load.sql` compares features, area and pieces per
    layer, rules row counts, privileges and database size with the local
    reference load.
- **Why:** Loading into the hosted database uses its real password over the
  internet.
- **Alternatives:** Full certificate verification with Supabase's CA file.

### D38. Keep-alive job
- **Date:** 2026-10-16
- **What:** `.github/workflows/keep-alive.yml` calls `region_outline()` with
  the anon key on Mondays and Thursdays. It fails (and GitHub emails) if the
  call fails or returns no regions. The URL and key come from repository
  secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`, and the job has no GitHub
  permissions.
- **Why:** Free projects pause after 7 days of inactivity. Twice a week
  leaves room for GitHub's scheduled runs, which can be delayed or skipped.
  Note that GitHub turns off scheduled workflows in repos with no commits
  for 60 days.
- **Alternatives:** Accept pausing; upgrade to Pro; ping weekly.

### D39. screen_site() refuses when region data or settings are missing
- **Date:** 2026-10-16
- **What:** Migration `20261016000259` changes `screen_site()` in two ways:
  - It now raises "outside the area we have data for" when no regions are
    loaded.
  - It raises an error if any `rules.settings` value is missing.

  `test_screen_site.sql` now also checks the no-region case, inside a
  transaction that is rolled back.
- **Why:** Step 2 checks on the hosted database, after its migrations but
  before its layers, showed `screen_site()` screening a 9 ha site against
  empty layers. It reported 9 ha plantable, £54,000 maintenance and £91,800
  costs covered.

  The cause: the union of zero regions is `NULL`, so "area outside the
  region > 1 m²" evaluated to `NULL`, and PL/pgSQL's `IF` treats that as
  false. Missing settings would have silently disabled limits in the same
  way. Both now fail closed.
- **Alternatives:** Rely on the layers always being loaded.

### D40. Box-clip before repair; fail on dead connections
- **Date:** 2026-10-16
- **What:**
  - The loader now cuts each feature to the region's bounding box (+1 km)
    with `ST_ClipByBox2D` *before* `ST_MakeValid`, then clips exactly as
    before.
  - The `pg` client uses TCP keep-alive and a 30-minute client-side query
    timeout.
- **Why:** The hosted load hung on Low Sensitivity v4 for over an hour: the
  loader was waiting on an open pooler connection, while the server showed no
  active query. One v4 feature has 747,475 vertices and 13,758 holes. It
  covers 432,933 ha, of which only 1,522 ha is in the region.
  - **Before:** repairing that one polygon whole took 11 s locally. On the
    free tier's shared CPU and 500 MB RAM, that most likely ended the
    database session, and the pooler never reported an error.
  - **After:** box-clipping first cuts it to 18,489 vertices in 0.05 s, and
    repairing it then takes 0.1 s. The whole v4 layer drops from 13.2 s to
    3.3 s locally.
  - **Same result:** a full local reload with the new method matches the
    previous load exactly on all 13 layers (features, hectares and piece
    counts), so hosted layers loaded with either method are identical.
  - **Timeout:** without a client-side timeout, a dead session hangs the
    loader forever.
- **Alternatives:** Pro plan compute; simplifying the source polygons
  (changes the data).
- **Note:** reloads leave dead space that Postgres reuses but does not return,
  and Supabase counts it. After several full local reloads the database
  reports 234 MB rather than 163 MB. Repeated full reloads on the hosted free
  tier should be followed by a `VACUUM FULL layers.features`.

## Security Advisor follow-up

### D41. Why screen_site() and region_outline() are public SECURITY DEFINER functions
- **Date:** 2026-10-16
- **What:** Both functions run as their owner (`postgres`) so they can read
  the private `layers` and `rules` schemas. EXECUTE is revoked from `PUBLIC`
  and granted only to `anon` and `authenticated`. Both pin `search_path`
  (`extensions, rules, layers, pg_temp`), so a caller can't substitute their
  own objects. Both are `STABLE`, so Postgres refuses any write inside them.
  The Security Advisor warns about each function once per role (4 warnings).
  These are intended.
- **What `screen_site()` can return:**
  - per-block areas;
  - the reason and area for each removal;
  - flags with plain-English explanations;
  - payments with rates and design conditions (all published gov.uk
    information);
  - limitations and source links;
  - the eligible and removed areas as shapes, clipped to the caller's own
    polygons and simplified to 1 m.
- **What it can't return:** raw layer features, attributes (beyond the
  `class` label shown as a reason or flag), anything outside the caller's
  polygons, other users' data (none is stored), or anything from other
  schemas.
- **Input limits** (thresholds in `rules.settings`):
  - a GeoJSON FeatureCollection of 1–50 Polygon/MultiPolygon features in
    lon/lat;
  - each with a non-zero area;
  - at most 2,000 ha in total;
  - no overlapping blocks;
  - the whole site inside a loaded region.

  It refuses if no region is loaded or any setting is missing (D39). The
  anon role's 3-second statement timeout caps run time; the worst case
  measured is 260 ms locally and about 0.6 s through the hosted API.
- **Residual risk:** someone could map layer boundaries inside the region by
  submitting many small polygons. Accepted: every layer is published open
  data, and the 3 s timeout and 2,000 ha cap limit the cost of each call.
- **What `region_outline()` can return:** no input; it returns only the
  10 m-simplified outline of each loaded region (an ONS open boundary),
  about 66 KB.
- **Why:** The website must never read layers directly (Phase 1 brief). These
  two functions are the only way in.
- **Alternatives:** An Edge Function holding the service-role key (more
  moving parts, same exposure); `SECURITY INVOKER` with RLS policies on
  `layers`, which would make the raw layers readable by anon.

### D42. Revoke EXECUTE on Supabase's rls_auto_enable() from API roles
- **Date:** 2026-10-16
- **What:** Migration `20261016103156` revokes EXECUTE on
  `public.rls_auto_enable()` from `PUBLIC`, `anon` and `authenticated`. It is
  guarded by an existence check, because only the hosted project (with
  "automatic RLS" on) has the function.
- **Why:** It is the event-trigger helper Supabase installs for automatic RLS
  ([docs](https://supabase.com/docs/guides/database/postgres/event-triggers)).
  No API role needs to call it, but in `public` it was callable through the
  Data API (2 Security Advisor warnings).
- **How it was tested** (locally, in a rolled-back transaction):
  1. Recreated the helper and its `ddl_command_end` event trigger, granted
     EXECUTE to anon and authenticated as on hosted, then applied the
     migration.
  2. Afterwards anon, authenticated and `PUBLIC` had no EXECUTE, and anon's
     direct call was refused (42501).
  3. A test role that is neither a superuser nor allowed to run the helper
     created tables with `CREATE TABLE` and `CREATE TABLE AS`. Both got RLS
     enabled automatically, as did a table created by `postgres`.

  Event triggers don't check EXECUTE when they fire. (The local `postgres`
  role is not a superuser either, like hosted.)
- **Alternatives:** Leave the warnings; turn off automatic RLS. RLS is
  already enabled explicitly in every migration, but the setting is a useful
  safety net.

### Test changes
- **Date:** 2026-10-16
- **What:**
  - `test_screen_site.sql`'s no-region check now swaps in an empty
    `layers.regions` table inside a rolled-back transaction, instead of
    deleting the region (which cascaded to all 92,219 pieces and would leave
    dead space on the free tier).
  - The missing-setting check is now in the file too.
  - `scripts/verify_hosted.sh` runs `verify_load.sql` and
    `test_screen_site.sql` against `DATABASE_URL`, passing it to psql through
    the environment only, and fails loudly if it can't connect.

### Phase 3 live
- **Date:** 2026-10-16
- **Result:** The website is live at
  https://land-funding-snapshot-snd5.vercel.app (commit `5142d37`, deployed
  by Vercel), using the hosted Supabase database.
- **Hosted database:**
  - All five project migrations are applied, and all 13 layers loaded.
  - `scripts/verify_hosted.sh` passes: every layer matches the local load
    on features, hectares and pieces; screen_site() passes 91/91, the 7
    shape checks and both fail-closed checks.
  - Size: 162 MB, 32% of the free tier's 500 MB.
  - Security Advisor: only the 4 intended warnings remain (D41). Anon now
    gets "permission denied" from `rls_auto_enable()` (D42).
- **Live checks** in a real browser:
  - All five test sites match the database test through the live UI: fine
    site about £31,900 one-off / about £85,900 over 15 years; SSSI and fen
    sites £0; riparian about £69,600 with access or about £36,300 without
    (plus "would add £33,300"); SSSI edge 4.77 ha plantable, about £5,200
    plus about £1,900 a year.
  - Each estimate appears in about 0.25–0.5 s, and every API call went to
    the hosted project.
- **Keep-alive:** the `SUPABASE_URL` and `SUPABASE_ANON_KEY` repository
  secrets were added. The first manual run of "Keep Supabase awake" passed
  ("Regions returned: 1"); after that it runs on Mondays and Thursdays.

## Phase 3b: explanation and interactivity

### D43. Developed land as a screening exclusion
- **Date:** 2026-10-16
- **What:** Natural England's Living England 2022–23, classes "Built-up Areas
  and Gardens" and "Solar Farms", loaded as `developed_land` (zones 6–9;
  59,287 features; 29,897 ha; about 46 MB). It is the sixth exclusion, after
  existing woodland.
  - **Loader changes:** `extra_services` (several service layers merged into
    one) and `where` (class filter).
  - **Loader bug fixed:** the geometry type is now always declared as
    MULTIPOLYGON. An empty first zone had created a layer with no geometry,
    and later zones were then appended without their shapes.
- **Why:** The user test (a 1,153 ha block over an industrial estate) showed
  built-up land being treated as plantable. The EWCO guidance says developed
  land and hard standing are ineligible. Solar farms are developed land on
  long leases.
- **Alternatives:** ONS Built Up Areas 2024 (too coarse: 20 ha minimum,
  misses farm yards); OS Open Map Local buildings (footprints only).

### D44. Ranges: low = land inside the target area, high = the "touches" rule
- **Date:** 2026-10-16
- **What:** For every map-based payment, `screen_site()` returns:
  - `inside_ha` and `inside_pct`: the plantable land actually inside the
    target area;
  - `low_amount_gbp`: the rate × `inside_ha`;
  - the qualifying shape.

  Totals are given as both low and high. Where they differ, the headline
  shows a range and one sentence explains it. Cards show both exact figures.
  For the nature recovery tiers, the low figure uses the tier that applies,
  times the area inside that tier.
- **Why:** The official rule pays a whole field that merely touches a target
  area, which can overstate the estimate. Showing both is honest.
- **Alternatives:** The touches rule only; the inside area only.

### D45. Large-block warning
- **Date:** 2026-10-16
- **What:** Fields drawn larger than `rules.settings.large_block_ha` (50) get
  a flag. The flag text is in `rules.messages`, with the threshold filled in.
  The headline also carries a note that the higher figure is likely to
  overstate.
- **Why:** Real compartments are designed with a Woodland Officer, so "touch"
  payments on a huge block overstate the estimate.

### D46. "How to get this" as data
- **Date:** 2026-10-16
- **What:** `rules.guidance_steps` holds 7 steps from gov.uk, checked
  2026-10-16, each with a source link:
  - register on Rural Payments;
  - talk to a Woodland Officer;
  - the planning grant (shown only at 5 ha or more plantable);
  - a planting plan that meets the UK Forestry Standard;
  - apply by 31 May (3–5 months to process);
  - when each payment is paid;
  - the land becoming non-agricultural.

  `screen_site()` returns the steps that apply as `next_steps`.
- **Why:** Same principle as the rates: wording with a source and a date
  checked, not hard-coded.

### D47. site_context(): layer shapes near the land only
- **Date:** 2026-10-16
- **What:** `public.site_context(site)` returns one group per payment target
  area (by layer and classes), per exclusion and per flag. Each is clipped to
  within `context_buffer_m` (1,000 m) of the drawn land, simplified (5 m,
  rising to about 13 m at 2,000 ha) and labelled. It returns no attributes.
  - **Same input checks as `screen_site()`:** both use a shared private
    `rules.parse_site()`.
  - **Not merged per request:** pieces are collected without merging, since
    merging thousands of pieces cost 1.3 s per request. Only pieces crossing
    the 1 km edge are clipped, and slivers under 50 m² are dropped.
  - **Speed:** about 130 ms locally for a farm, about 0.9 s at 2,000 ha.
  - **Failure handling:** the website loads it after the estimate and
    carries on if it fails.
- **Why:** Layer toggles on the results map, without making the raw layers
  public.

### D48. One map-first workspace
- **Date:** 2026-10-16
- **What:** `/check` is a single workspace.
  - **Layout:** the map is always on the left (desktop) or full screen behind
    a three-height bottom sheet (phone: peek, half or full, set by a handle
    button). The panel moves from fields, to the question, to results.
  - **Live updates:** the public-access answer becomes a switch that re-runs
    the estimate at once. Field edits, renames and deletions re-run it 1 s
    after the last change, and out-of-date replies are ignored.
  - **Linked selection:** "Show on map" on a payment card switches on that
    target area and outlines the qualifying land. Clicking a field on the map
    opens its breakdown in the panel.
  - **Layer key:** a "Map layers and key" panel on the map lists the target
    areas, exclusions and flags, all off by default.
  - **Shared colours:** a single colour per payment links the map, the cards
    and the "where the money comes from" bar (high figures over 15 years,
    excluding costs covered).
- **Why:** It matches the agreed map-first, linked design, and the user
  never has to go back through the steps to see a change.
- **Implementation notes:**
  - MapLibre's stylesheet makes the map container `position: relative`, so
    the container is sized explicitly.
  - Fields are labelled from a single interior point, because polygon labels
    repeat in every map tile.
  - Clicking a field scrolls only the panel, not the page.

### D49. Lighter result shapes for big blocks
- **Date:** 2026-10-16
- **What:**
  - Result shapes are simplified to max(1 m, √block area / 1,000), about
    3.4 m for 1,150 ha.
  - When at least 99.5% of a field is inside a target area, the qualifying
    shape is omitted (`qualifying_is_whole_field`) and the map uses the
    field's shape instead.
- **Why:** At 2,000 ha the response was 2.3 MB. It is now 2.0 MB at
  2,000 ha and 0.3–0.4 MB at 500 ha.

### Phase 3b test results (local)
- **Date:** 2026-10-16
- **SQL tests:**
  - `verify_load.sql`: 27/27, including developed land.
  - `test_screen_site.sql`: 91/91, plus both fail-closed checks. The Phase 2
    sites are unchanged, since none contain developed land.
  - `test_explain_context.sql`: 47/47. It covers:
    - inside areas for sites 1 and 4, worked out by hand;
    - Huntingdon's inside areas recomputed independently from the layers;
    - low ≤ high;
    - the 49 ha (no flag) and 51 ha (flag) blocks;
    - the planning-grant step at 9 ha but not 4.77 ha;
    - `site_context()` returning shapes only within 1,000 m, no attributes,
      the same input errors, and the right privileges.
- **Browser, desktop (1280 px):**
  - Summary, range, money bar, cards with inside area and percentage.
  - "Show on map" highlighting, clicking a field on the map, the
    public-access switch (0.2 s), a rename (re-run after 1.2 s), and
    dragging a field (live re-run). Plain-English layer key.
- **Browser, phone (375 px):** bottom sheet at three heights, no sideways
  scrolling, toolbar clear of the zoom buttons.
- **User-test case:** the 1,150 ha Huntingdon block now loses 761 ha
  (mostly developed land) and shows about £2.07 m to £3.40 m one-off with the
  large-field warning, instead of £7.7 m.

### D50. Site size limit lowered from 2,000 ha to 500 ha
- **Date:** 2026-10-17
- **What:** `rules.settings.max_site_drawn_ha` is now 500, set in migration
  `20261016115544`, for both `screen_site()` and `site_context()`. The
  website's error message reads the limit from the server's message, so it
  can't drift. This supersedes the 2,000 ha figure in D22 and D41.
- **Why:** With per-payment shapes and developed land, the worst case (a
  built-up 2,000 ha block) took 1.7 s locally. The live function measured
  2.5–3× slower on the hosted free tier, which would be about 4–5 s, past
  the anon role's 3-second timeout. The worst case at 497 ha is 0.45 s
  (`screen_site()`) and 0.63 s (`site_context()`) locally, roughly 1.2–1.8 s
  hosted. Larger holdings are checked in parts, which the large-field
  warning already encourages.
- **Tests:**
  - The Huntingdon case is now a 441 ha block: 273 ha of developed land
    removed, low £436,988 against high £647,922, large-field flag.
  - New checks that both functions refuse a 600 ha site with "site is
    larger than the 500 ha limit".
  - The whole migration applies cleanly on top of the pre-3b state (tested
    in a rolled-back transaction).
- **Alternatives:** 1,000 ha (occasional cold-start timeouts); a longer anon
  timeout; Supabase Pro.

### D51. Site size limit 400 ha, after hosted timings (proposed; migration ready)
- **Date:** 2026-10-17
- **What:** Migration `20261017114314` sets `max_site_drawn_ha` to 400.
  Tests now use a 361 ha Huntingdon block and check that both functions
  refuse 450 ha. The 1 km `site_context()` surround stays.
- **Why:** Measured on the hosted free tier through the API with the anon
  key, on the worst-case built-up edge:
  - **`screen_site()`, warm:** 0.71–0.74 s at 300 ha, 0.73–0.83 s at
    400 ha, 1.13–1.15 s at 497 ha.
  - **Cold start:** the first call in a session took 2.37 s for a site that
    then ran in 0.71 s, so a cold start adds about 1.6 s. The likely cause
    is the free tier's small memory not keeping 222 MB of layers cached.
  - **So:** a cold call would be about 2.8 s at 497 ha, too close to the
    3 s anon timeout, and about 2.4 s at 400 ha.

  The verify script's in-database timing (2.06 s at 497 ha) was probably
  partly cold.
- **`site_context()`:** about 1.6–1.9 s warm on hosted at 300–497 ha,
  largely independent of size. A smaller surround barely helps large sites:
  locally 484 → 377 ms at 398 ha for 1 km → 500 m. A cold call on a very
  large site can still time out; the website then keeps the estimate and
  shows "nearby layers aren't available". Gzip keeps transfers to about
  125–135 KB.
- **Alternatives:** 500 ha (cold calls near the limit); 300 ha; a 500 m
  surround; Pro compute.

### Phase 3b live
- **Date:** 2026-10-17
- **Result:** Live at https://land-funding-snapshot-snd5.vercel.app/check
  (commit `edddc65`, deployed by Vercel).
- **Hosted database:**
  - Migrations `20261016115544` and `20261017114314` applied, and
    `developed_land` loaded.
  - `verify_hosted.sh`: 14/14 layers, 91/91 `screen_site()`, 47/47 Phase 3b,
    both fail-closed checks.
  - Size: 222 MB, 44% of 500 MB.
- **Anon API checks:**
  - The fine site and the 441 ha Huntingdon block match local exactly.
  - 450 ha is refused by both public functions.
  - `site_context()` returns labels and shapes only, within 1,000 m.
  - `parse_site`, `rules`, `layers` and `rls_auto_enable` stay private.
- **Live UI:**
  - All five test sites match the database test.
  - A ~360 ha Huntingdon block shows about £456,300 to £671,200 with the
    explanation and the large-field note.
  - "Show on map" and the layer toggles work.
  - Phone (375 px): bottom sheet at three heights, no sideways scrolling,
    toolbar clear of the zoom buttons, public-access switch updating in
    place.

### D52. Summary wording for what was left out
- **Date:** 2026-10-17
- **What:** The plain summary names exclusions with phrases keyed by
  exclusion code, not the lower-cased database label. Each has two forms:
  "because it is in an SSSI" when it is the only reason, and "mainly land in
  an SSSI" when there are several. A site with nothing plantable now reads
  "None of the 9 ha you drew could be planted" (it said "Only 0 ha").
- **Why:** "mainly site of special scientific interest" read badly. All six
  exclusions were checked in both forms.
