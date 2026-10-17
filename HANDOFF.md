# Handoff

Everything a new session needs to carry on without the previous
conversation. Read this, then `AGENTS.md`, `README.md` and `DECISIONS.md`
(61 numbered decisions, D1–D61, plus test-result notes).

Last updated: 2026-10-17.

---

## 1. What this is

**Land Funding Snapshot**: a web app where a landowner in England draws or
uploads their fields and gets a plain-English estimate of England Woodland
Creation Offer (EWCO) funding:
- what could be planted;
- what is left out and why;
- which payments apply, with an honest low–high range;
- what to do next.

**Principle:** the database and code decide eligibility and money; AI only
explains.

This is a portfolio prototype, to be shown to Land App. Don't imitate Land
App's branding.

**Stack:**
- Next.js 16.4 (TypeScript, App Router, Tailwind 4) on Vercel.
- Supabase: Postgres 17, PostGIS 3.3, RLS, free tier.
- MapLibre 6 + Terra Draw for the map.
- The data loader is TypeScript driving GDAL 3.13.3 in Docker.

**Region:** Cambridgeshire and Peterborough only (ONS Combined Authority
E47000008).

**Places:**
- **Repo:** https://github.com/finlaymilller40/land-funding-snapshot (public)
- **Local folder:** `~/Documents/land-funding-snapshot`
- **Live site:** https://land-funding-snapshot-snd5.vercel.app (workspace at `/check`)
- **Hosted Supabase:** one project (the only one in the org), linked with
  `npx supabase link`. The project ref is in `supabase/.temp/project-ref`,
  which git ignores.

---

## 2. How we work (rules from the user)

1. **Ask before any design decision not in the brief.** Explain the options
   with a recommendation and wait. Ask in plain chat text with numbered
   questions; the user answers like "1a 2b 3 yes". Don't use pop-up question
   dialogs, which the user dismisses.
2. **Log every decision in `DECISIONS.md`** with date, what, why and
   alternatives. Continue the numbering from D62.
3. **Secret-scan before every commit.** No keys, passwords, `.env*` or
   `data/` files. A minimal check:
   `git diff --cached | grep -nE '(sb_secret_|eyJhbGciOi|gho_|ghp_|SUPABASE_[A-Z_]*KEY=[^<]|postgres(ql)?://[^@]*:[^@]*@)'`.
   The only allowed hit is the local default
   `postgres:postgres@127.0.0.1`.
4. **Never push to GitHub, and never touch the hosted database, without the
   user's explicit OK** for that specific action. Pushing to `main` deploys
   to Vercel.
5. **The user runs anything that needs the database password:**
   `npx supabase db push`, `npm run load-layers` against the hosted
   database, and `./scripts/verify_hosted.sh`. Never enter or handle the
   password. The session may read the public anon key (for example with
   `npx supabase projects api-keys`, extracting only `anon`) to test the
   hosted API, and should delete any scratch copy afterwards.
6. **Explain each step in plain language** at the end of each step.
7. **Work locally first.** Test in a real browser at desktop and phone
   widths. Keep all tests passing.
8. **Copy:** plain English in headings, with scheme terms only in detail.
   Headline money is rounded to £100 and labelled "about". Income and costs
   covered are never added together. Ranges are shown honestly.
9. **gov.uk content:** written only from the EWCO guidance and the
   Additional contributions page. Don't invent requirements. Store wording
   in database tables with source links and a date checked.

---

## 3. Status of every phase

| Phase | What | Status |
|---|---|---|
| 0 | Empty pipeline: Next.js → Supabase → Vercel | Live (test page since replaced) |
| 1 | 14 open-data layers in a private `layers` schema, re-runnable loader | Live on hosted |
| 2 | EWCO rules engine `public.screen_site()` with rates and rules in a private `rules` schema | Live |
| 3 | Website: start page and `/check` flow | Live |
| 3b | Developed land, ranges (low = land inside the target area, high = the "touches" rule), large-block warning, "how to get this", `site_context()`, one map-first workspace, 400 ha limit | **Live** |
| Design pass | App shell, shadcn/ui, redesigned panel and start page, per-payment breakdown | **Built locally, committed, not pushed** (see §6) |

**Deployed and pushed:** commit **`edddc65`** ("Prepare a 400 ha site limit
from hosted timings"), deployed by Vercel on 2026-10-17.

**Local only, not pushed:**
- **`3e9a843`**: the summary wording for what was left out ("…because it
  is in an SSSI"), plus "Phase 3b live" notes in the README and
  DECISIONS.md.
- The commit adding this HANDOFF.md and the AGENTS.md update.

- The design pass (D53–D59): a database commit (migration
  `20261017130000`, new SQL tests) and a front-end commit.

All need the user's OK to push. Pushing triggers a Vercel deploy. **Order
matters:** the user runs `npx supabase db push` (and `verify_hosted.sh`)
*before* the push, because the new website reads `payment_details` and
`not_on_this_land`, which the hosted `screen_site()` doesn't return yet.

**Hosted database state** (verified 2026-10-17 by the user with
`verify_hosted.sh`; all pass):
- **Migrations:** all 9 in `supabase/migrations/` applied, the last being
  `20261017114314_lower_site_limit_to_400_ha.sql`.
- **Layers:** all 14 loaded, matching local exactly on features, hectares
  and pieces. `developed_land` was loaded last.
- **Size:** 222 MB, 44% of the free tier's 500 MB.
- **Settings:**
  - `max_site_drawn_ha` = **400**;
  - `large_block_ha` = 50;
  - `context_buffer_m` = 1000;
  - `context_simplify_m` = 5;
  - `min_site_eligible_ha` = 1;
  - `min_block_eligible_ha` = 0.1;
  - `max_blocks` = 50.
- **Security Advisor:** 4 intended warnings remain: `screen_site()` and
  `region_outline()` × anon/authenticated (D41). `site_context()` probably
  adds two more, also intended. `rls_auto_enable()` is revoked from API
  roles (D42).
- **Keep-alive:** the GitHub Action `.github/workflows/keep-alive.yml` calls
  `region_outline()` on Mondays and Thursdays. Repository secrets
  `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set, and the first run passed.

**Why 400 ha (D50, D51):** hosted timings through the API:
- **`screen_site()` warm, worst case** (a built-up edge): 0.75 s at 400 ha
  and 1.1 s at 497 ha.
- **Cold start:** adds about 1.6 s.
- **Anon timeout:** 3 s.
- **`site_context()`:** about 1.6–1.9 s warm and largely independent of
  size. A cold call can time out on large sites; the UI degrades gracefully
  ("nearby layers aren't available").

---

## 4. Running and testing

**Local setup:**
- Start Docker Desktop. `docker` is at `~/.docker/bin`, which is on the PATH
  in `~/.zshrc`.
- `npx supabase start`
- First time only, `npm run load-layers` (about 15 minutes, mostly
  downloads; reuses `data/raw/` afterwards). `-- --only <ids>` loads
  specific layers and `-- --refresh` re-downloads.
- `npm run dev`, then open http://localhost:3000/check. `predev`/`prebuild`
  copy MapLibre's worker into `public/vendor/`, which git ignores.
- The Claude desktop in-app browser preview config is `land-funding-dev` in
  this repo's `.claude/launch.json` (git-ignored). If the map stays blank or
  half-drawn in the in-app browser, the pane is hidden
  (`document.hidden` is true, so animation frames only run when a
  screenshot is taken): take another screenshot before judging the map.
- Apply new migrations locally with `npx supabase migration up --local`
  (add `--include-all` once: the local history was missing
  `20261016103156`, a guarded no-op locally). `db reset` wipes the layers.

**SQL tests** (run against local):
```
docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/verify_load.sql          # 27 pass
docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_screen_site.sql     # 91/91 + 2 fail-closed
docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_explain_context.sql # 47/47
docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_payment_details.sql # 33/33
```
- **Hosted (the user runs it):** `./scripts/verify_hosted.sh` runs all four
  against `DATABASE_URL` (the Session pooler string, set with
  `read -s "DATABASE_URL?…" && export DATABASE_URL`).
- **Front end:** `npx tsc --noEmit -p . && npx eslint src scripts && npm run build`.
- **Five standard test sites** (300 m squares, British National Grid
  lower-left corners), expected one-off / total:

  | Site | Lower-left corner | Expected |
  |---|---|---|
  | 1. Fine | 511000, 272000 | £31,871 / £85,871 |
  | 2. Brampton Wood SSSI | 517904, 270037 | £0 |
  | 3. Fen | 532852, 285459 | £0, deep peat |
  | 4. Riparian | 529500, 261500 | £69,596 / £123,596 with access; £36,296 without |
  | 5. SSSI edge | 542750, 246250, plus a 25 m block at 543060, 246250 | £5,242, 4.77 ha |

- **Large-block case:** a 361 ha Huntingdon block centred on 524500,
  272500 (±950 m) gives a range of £335,144 to £495,851.

**Main code:**
- **Database migrations:** `supabase/migrations/`. The latest `screen_site`
  is in `20261017130000` (adds `payment_details`, `not_on_this_land`);
  `site_context`, `parse_site` and `guidance_steps` are in `20261016115544`.
- **Loader:** `scripts/load_layers.ts`, configured by `config/layers.json`
  and `config/regions/`.
- **Front end:**
  - `src/components/Workspace.tsx`: state, phases, live re-runs, layout;
  - `AppShell.tsx`: top bar, sidebar views, phone drawer;
  - `WorkspaceMap.tsx`: MapLibre, Terra Draw, overlays, toolbar;
  - `ResultsPanel.tsx`, `PanelSection.tsx`, `PaymentRow.tsx` (the 7-part
    breakdown), `MapLegend.tsx`, `InfoViews.tsx` (How to get this, Sources &
    rates, About);
  - `src/components/ui/`: shadcn/ui components;
  - `src/lib/screen.ts`: types and RPC calls;
  - `src/lib/wording.ts`: plain-English titles, colours, icons, tags,
    summary sentences; `src/lib/patterns.ts`: hatch patterns;
  - start page: `src/app/page.tsx`, `RegionOutline.tsx`,
    `public/workspace-preview.webp` (`scripts/capture-preview.mjs`).

---

## 5. Known gotchas (each cost time once)

- **MapLibre 6:**
  - Named imports only.
  - Serve the worker yourself (`setWorkerUrl`).
  - Its stylesheet sets the container to `position: relative`, so size it
    explicitly.
  - Label polygons from a point source; polygon labels repeat per tile.
- **`next/dynamic`** doesn't forward refs. Pass handles as normal props.
- **Terra Draw** fires `change` synchronously inside `addFeatures`. React
  dev mode runs state updaters twice, so keep updaters pure.
- **GDAL append:** always pass `-nlt MULTIPOLYGON`. An empty first page
  otherwise creates a geometry-less layer.
- **PL/pgSQL:**
  - Records are "not null" only if every field is.
  - `st_union(geometry[])` drops the SRID; use the aggregate form.
  - Variable names clash with column aliases.
  - Null comparisons silently pass `IF`, so everything fails closed.
- **The `npx supabase migration new` CLI can hang** on its update check.
  Write migration files by hand with a UTC timestamp name.
- **Tailwind dev loader:** an edit to `src/app/globals.css` was sometimes
  not picked up by `npm run dev` (the CSS chunk kept its old content).
  Restart the dev server after editing it.
- **shadcn CLI 4.22** adds its new `cn` package; this repo uses
  `src/lib/utils.ts` (clsx + tailwind-merge) instead (D53). After adding a
  component, change `from "cn"` to `from "@/lib/utils"` and remove the
  package again.
- **Hosted free tier:** about 3–4.6× slower than local, plus a cold-start
  penalty. Large unions per request are too slow, so collect pieces
  instead. The giant Low Sensitivity v4 polygon needs a box-clip before
  `ST_MakeValid` (D40).

---

## 6. The design pass: built locally (2026-10-17)

Everything in the agreed plan (answers **1a 2a 3 yes 4a 5a 6 as
recommended**) plus the two additions is built, tested locally and
committed, but **not pushed**: D53–D59 in `DECISIONS.md` have the detail.

- **Shell and layout (D55):** top bar, sidebar views, map key, 400 px panel
  with collapsible sections and status tags, phone sheet and three-height
  vaul drawer.
- **Design system and colours (D53, D54):** shadcn/ui + Lucide on the
  palette tokens, one type scale, Okabe–Ito target areas, vermillion hatched
  exclusions, dotted flags, bold haloed fields.
- **Not on this land (D56)** and **what each payment entails (D57):** new
  migration `20261017130000`, new `rules.payment_details`,
  `rules.payment_items` and `rules.payment_groups` tables, written only from
  the two gov.uk pages (re-read 2026-10-17), and
  `scripts/sql/test_payment_details.sql`.
- **Start page (D58)** with a captured workspace preview and region outline.

**To go live (needs the user):**
1. `npx supabase db push` (applies `20261017130000`; it was tested in a
   rolled-back transaction on top of the current hosted state).
2. `./scripts/verify_hosted.sh` (now four suites; expect 27, 91 + 2, 47, 33).
3. The user's OK to push to GitHub, which deploys on Vercel. Then check the
   live site at desktop and phone widths.

**Small things noticed, not changed:**
- The Step 2 question text says "£3,700 per hectare" in code (D60): update
  it by hand if the recreational access rate changes.
- An upload made before the map has finished loading is shown as
  "uploaded as several parts" (not reshapeable). Only a fast script hits
  this.

## 7. Open items
- **Commit `3e9a843`** (and the handoff commit) is local; push only with the
  user's OK.
- **Phase 4: AI explanations.** AI explains results only; it never decides
  eligibility or money.
- **CI and generated types:** for example GitHub Actions running lint, type
  check and build, and the SQL tests against a Supabase instance in CI.
  Also Supabase-generated TypeScript types for the RPC results, replacing
  the hand-written ones in `src/lib/screen.ts`.
- **Carbon estimate** for the planted area.
- **Trees vs current income:** compare EWCO income with the land's current
  farming income.
- **Pitch materials** for Land App.
