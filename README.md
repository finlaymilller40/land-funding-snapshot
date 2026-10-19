# Land Funding Snapshot

A web app where a landowner in England draws or uploads their land and gets a
plain-English summary of which nature funding schemes it may qualify for
(starting with the England Woodland Creation Offer), how much it could earn,
and what to do next.

**Principle:** the database and code decide eligibility and money; AI only
explains the results.

> Portfolio prototype. Not financial or legal advice.

## Status

**Phase 0 (empty pipeline): done, 2026-10-15.** The live site at
https://land-funding-snapshot-snd5.vercel.app reads one test row from the
hosted Supabase database on every visit, proving Next.js → Supabase → Vercel
works end to end. (The test page has since been replaced by the website.)

**Phase 1 (open data layers): loaded locally, 2026-10-15.** Thirteen open
layers for Cambridgeshire and Peterborough sit in a private `layers` schema.
`layers.site_overlaps(polygon)` lists every layer a site overlaps, with the
area in hectares, in milliseconds. Loaded on the hosted database since
2026-10-16.

**Phase 2 (EWCO rules engine): built locally, 2026-10-15.** `screen_site()`
takes a site (GeoJSON, one polygon per block) and a public access answer, and
returns the eligible area, what was removed and why, flags, payments and £
values per block and in total. Rates and rules live in the private `rules`
schema with their gov.uk source and check date. Live on the hosted database
since 2026-10-16.

**Phase 3 (website): live, 2026-10-16** at
https://land-funding-snapshot-snd5.vercel.app, running on the hosted Supabase
database (all 13 layers loaded, 162 MB of the free tier's 500 MB). A start page and a
three-step `/check` flow: draw or upload fields, answer one question about
public access, then see the estimate. Headline figures are rounded and
labelled "about", costs covered are shown separately from income, and a map
shows what could be planted and why the rest was left out.

**Phase 3b (explanation and interactivity): live, 2026-10-17.**
- **Developed land** is now removed from the plantable area.
- **Map-based payments** show how much land is inside the target area, and
  touch-based payments give a low–high range.
- **Very large fields** get a warning, and **"How to get this"** gives the
  gov.uk steps.
- **One map-first workspace:** layer toggles, linked selection, a live
  public-access switch, and re-estimates as you edit fields.

Live since 2026-10-17 (sites up to 400 ha; hosted database 222 MB, 44% of
the free tier's 500 MB).

**Design pass: built locally, 2026-10-17 (not yet live).**
- **App shell:** a top bar (region, postcode search), a light sidebar that
  switches the panel between Workspace, My fields, How to get this, Sources &
  rates and About, the map, and a 400 px detail panel of collapsible sections
  with status tags. On phones the sidebar is a sheet and the panel a drawer
  with three heights.
- **Design system:** shadcn/ui components and Lucide icons on the existing
  earthy palette, one type scale, colour-blind-safe map colours, and hatched
  "can't plant" areas.
- **What each payment entails:** each payment row opens to what it pays, why
  the government pays it, why your land qualifies, a checklist of what you'd
  have to do, what you're committing to, when it's paid and the gov.uk
  source. The wording is in database tables with source links.
- **Not on this land:** bonuses checked but not reaching the land are listed.
- **Start page:** redesigned, with a workspace preview, three steps and the
  area covered.

Going live needs the user to run `npx supabase db push` (one new migration)
and `./scripts/verify_hosted.sh`, then a push to GitHub.

## Stack

- Next.js (TypeScript, App Router, Tailwind CSS) on Vercel
- shadcn/ui (Radix) components in `src/components/ui`, Lucide icons, vaul drawer
- MapLibre GL and Terra Draw for the map
- Supabase: Postgres + PostGIS, Auth, row-level security
- Supabase CLI (npm dev dependency) with Docker for local development

## Run locally

Needs Node.js 20+ and Docker Desktop running.

```bash
npm install
npx supabase start
```

Create `.env.local` using the `API_URL` and `ANON_KEY` values printed by
`npx supabase status`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
```

Then `npm run load-layers` (first time only, about 6 minutes) and `npm run dev`, and open
http://localhost:3000/check. `npm run dev` and `npm run build` first copy MapLibre's
web worker into `public/vendor/`.

Never put the service role key in `.env.local` or any front-end code.

## Database changes

Migrations live in `supabase/migrations/`. Write new ones by hand with a UTC
timestamp name (`npx supabase migration new` can hang). Apply them locally
with `npx supabase migration up --local` (`npx supabase db reset` also works
but wipes the loaded layers), and push them to the hosted project with
`npx supabase db push`.

## Open data layers

Needs Docker running and the local database started.

```bash
npm run load-layers
```

This downloads each layer listed in `config/layers.json` for the region in
`config/regions/` into `data/raw/` (git-ignored, about 235 MB), then clips,
subdivides and loads it into `layers.features`. Re-running reuses the
downloads; add `-- --refresh` to fetch again, or `-- --only sssi,peat_status`
to load specific layers. Point it at another database with `DATABASE_URL`.

Test the overlap query on three sample sites:

```bash
docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_overlaps.sql
```

## Screening a site

`public.screen_site(site jsonb, public_access boolean)` is the only database
function the website can call (anon key).

```bash
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/screen_site" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"site": {"type": "FeatureCollection", "features": [...]}, "public_access": true}'
```

Rates, exclusions, flags and wording are rows in `rules.*` tables, not code.
That includes what each payment entails (`rules.payment_details` and the
`rules.payment_items` checklist), written only from the gov.uk EWCO guidance
and Additional contributions pages (and, for EIA, the forestry EIA guidance), each line with its section and date
checked. The result returns them as `payment_details`, plus
`not_on_this_land` for bonuses checked that don't reach the land.

Tests:

```bash
docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_screen_site.sql      # hand-worked values
docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_explain_context.sql  # ranges, site_context()
docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_payment_details.sql  # payment details, not on this land
docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_small_pieces.sql     # pieces under 0.1 ha, limitations
docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_region_edge.sql      # BFE boundary, land outside left out
```

`./scripts/analyse_protected_sites.sh` compares Ramsar, SPA, SAC, NNR and LNR
land with the SSSIs (local database only; see D63).

The start page's workspace preview is captured with
`node scripts/capture-preview.mjs public/workspace-preview.webp <fields.geojson>`
(see the script for the fields used).

### Data sources and attribution

Each layer's source URL, licence and attribution text is recorded in
`layers.sources` (and `config/layers.json`). Data from Natural England,
Historic England, the Forestry Commission and ONS is used under the Open
Government Licence v3.0. **England Peat Status is under the Non-Commercial
Government Licence v2.0**: non-commercial use only.

## Decisions

See [DECISIONS.md](DECISIONS.md).
