# Handoff

Everything a new session needs to carry on without the previous
conversation. Read this, then `AGENTS.md`, `README.md` and `DECISIONS.md`
(52 numbered decisions, D1–D52, plus test-result notes).

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
   alternatives. Continue the numbering from D53.
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
| Design pass | App shell, shadcn/ui, redesigned panel and start page, per-payment breakdown | **Planned and agreed, not started** (see §6) |

**Deployed and pushed:** commit **`edddc65`** ("Prepare a 400 ha site limit
from hosted timings"), deployed by Vercel on 2026-10-17.

**Local only, not pushed:**
- **`3e9a843`**: the summary wording for what was left out ("…because it
  is in an SSSI"), plus "Phase 3b live" notes in the README and
  DECISIONS.md.
- The commit adding this HANDOFF.md and the AGENTS.md update.

Both need the user's OK to push. Pushing triggers a Vercel deploy;
`3e9a843` changes UI wording only.

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
- The Claude desktop in-app browser preview config is
  `land-funding-dev` in the *old* project's `.claude/launch.json`
  (`npm --prefix ~/Documents/land-funding-snapshot run dev`). If the map
  stays blank in the in-app browser, the pane is hidden: take a screenshot
  to make it render.

**SQL tests** (run against local):
```
docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/verify_load.sql          # 27 pass
docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_screen_site.sql     # 91/91 + 2 fail-closed
docker exec -i supabase_db_land-funding-snapshot psql -U postgres < scripts/sql/test_explain_context.sql # 47/47
```
- **Hosted (the user runs it):** `./scripts/verify_hosted.sh` runs all three
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
- **Database migrations:** `supabase/migrations/`. The latest functions are
  in `20261016115544` (`screen_site`, `site_context`, `parse_site`,
  `guidance_steps`).
- **Loader:** `scripts/load_layers.ts`, configured by `config/layers.json`
  and `config/regions/`.
- **Front end:**
  - `src/components/Workspace.tsx`: state, phases, live re-runs;
  - `WorkspaceMap.tsx`: MapLibre, Terra Draw, overlays;
  - `ResultsPanel.tsx`;
  - `LayerControls.tsx`;
  - `src/lib/screen.ts`: types and RPC calls;
  - `src/lib/wording.ts`: plain-English titles, colours, summary sentences.

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
- **Hosted free tier:** about 3–4.6× slower than local, plus a cold-start
  penalty. Large unions per request are too slow, so collect pieces
  instead. The giant Low Sensitivity v4 polygon needs a box-clip before
  `ST_MakeValid` (D40).

---

## 6. Next: the design pass (agreed, not started)

**User's answers to the plan:** **1a 2a 3 yes 4a 5a 6 as recommended**, plus
two additions (§6.6 and §6.7). The goal is to make the workspace look like a
polished professional nature platform. Darwin's nature platform is the
reference for structure and density only: don't copy its branding, colours
or layout. Keep it readable for farmers and agents. Keep the earthy palette,
plain English, honest ranges, income vs costs separation, and accessibility.

### 6.1 Components and libraries
- **shadcn/ui** (CLI 4.22.0; Radix-based; supports Tailwind 4 and React 19)
  and **Lucide** icons (`lucide-react` 1.59.0).
- **Components to add:** Button, Badge, Switch, Collapsible, Checkbox,
  Select, Input, Tooltip, Sheet, Drawer (vaul 1.1.2), Separator, ScrollArea,
  Progress and Sidebar (with icon-collapsed mode and a phone Sheet).
- Copy the components into `src/components/ui`. Map shadcn's CSS variables
  to our palette tokens; no new colours outside the token list.
- **Replace the hand-built** buttons, toggles, collapsibles, tags and tabs
  with these.

### 6.2 Colours
- **Base:**
  - paper `#f7f5ef` (page), white (panels), line `#d9d4c7`;
  - ink `#1f2421` (14.5:1), muted `#55605a` (6.0:1);
  - primary: moss `#2f4a32`, hover `#243a27`;
  - focus: ink outline with a yellow `#ffd84d` halo.
- **Status tags** (all at least 4.5:1):

  | Tag | Colours |
  |---|---|
  | Qualifies | moss on `#e3ecdf` |
  | Partly | `#6b4a00` on `#fbf1d6` |
  | Not this land | muted on `#eeece6` |
  | Left out / issue | `#8f4a31` on `#f6e9e2` |

- **Map layers** (colour-blind-safe Okabe–Ito):
  - **Payment target areas:**

    | Area | Colour |
    |---|---|
    | Nature recovery | `#009E73`; the 3 tiers differ by fill strength and by solid / dashed / dotted outline |
    | Flood reduction | `#0072B2` |
    | Cleaner water | `#56B4E9` |
    | Riverside shade | `#CC79A7` |
    | Near towns / public access | `#E69F00` |
    | Lower-risk land | `#F0E442` |

  - **Exclusions (answer 4a):** one vermillion `#D55E00` family, told apart
    by **hatch patterns** (generate pattern images for MapLibre
    `fill-pattern`) and icons.
  - **Flags:** dotted dark outline, no fill.
  - **Fields:** bold 3 px ink outline with a white halo; the selected field
    is 5 px plus an ochre glow.
  - **Fills:** 25–45% opacity.

### 6.3 Type and spacing (one scale each, used everywhere)

| Token | Size / line height | Use |
|---|---|---|
| `text-xs` | 12 / 16 | tags, legend, captions |
| `text-sm` | 14 / 20 | rows, controls, sidebar |
| `text-base` | 16 / 24 | panel paragraphs |
| `text-lg` | 20 / 28 | section headings |
| `text-xl` | 24 / 32 | panel title |
| `text-2xl` | 30 / 36 | headline amounts |

Override Tailwind's `--text-*` tokens to match.
- **Spacing:** a 4 px base, using only 4 · 8 · 12 · 16 · 24 · 32.
- **Rows:** 36 px with a mouse, 44 px on touch screens (`pointer: coarse`).

### 6.4 Icons (Lucide)

| Group | Item | Icon |
|---|---|---|
| Payments | Nature recovery | Sprout |
| | Flood reduction | Waves |
| | Cleaner water | Droplet |
| | Riverside shade | TreeDeciduous |
| | Woodland near towns | Building2 |
| | Public access | Footprints |
| | Lower-risk land | ShieldCheck |
| | Upkeep | CalendarClock |
| | Costs covered | Receipt |
| Exclusions | SSSI | Bird |
| | Scheduled Monument | Landmark |
| | Priority habitat | Flower2 |
| | Deep peat | Layers |
| | Existing woodland | Trees |
| | Developed land | Building |
| Flags | Grade 1–2 farmland | Wheat |

### 6.5 Layout
**Desktop shell:**
```
┌ top bar 48px: ▣ Land Funding Snapshot · Region [Cambridgeshire & Peterborough ▾] · [Postcode… 🔍] · Prototype · ? ┐
├ sidebar 224px (56 collapsed) ┬ map (flexible) ─────────────────────────┬ detail panel 400px ───────────────┤
│ ⌂ Workspace                  │ [Draw][Edit][Select] [Aerial]   [+][−] │ YOUR ESTIMATE        Updating…    │
│ ▤ My fields                  │                                         │ 9.0 ha drawn · 9.0 plantable      │
│ ☰ How to get this            │   fields bold outline, plantable /      │ ▾ Summary            [Estimate]   │
│ ⓘ Sources & rates            │   left-out fills, selected target       │ ▾ Where the money    [15 yrs]     │
│ ? About                      │   hatched                               │ ▾ Payments  [4 qualify·1 partly]  │
│ « collapse                   │ ┌ Legend (docked, collapsible) ┐        │ ▾ Left out           [4.2 ha]     │
│                              │ │ toggles + icons by group      │        │ ▸ Worth checking     [1]          │
│                              │ └───────────────────────────────┘        │ ▸ Fields             [2]          │
└──────────────────────────────┴─────────────────────────────────────────┴───────────────────────────────────┘
```
- **Sidebar (1a, 2a):** light (paper background, moss highlight on the
  active item). Each item **switches the right panel's view** and the map
  stays visible:
  - **Workspace:** the steps, then the estimate.
  - **My fields:** list, rename, delete, upload, show on map.
  - **How to get this:** the gov.uk steps.
  - **Sources & rates:** rates table with date checked and links, data
    credits, limitations.
  - **About.**
- **Top bar:** the tool name, a region Select (one region for now), the
  postcode search (moved here), a Prototype tag and help.
- **Detail panel:** collapsible sections, each with a status tag. The
  public-access Switch row sits in Summary. Stacked "where the money comes
  from" bar (high figures over 15 years, excluding costs covered). No extra
  per-payment chart (answer 6).
- **Legend:** docked bottom-left of the map, collapsible, with toggles and
  icons grouped as Your estimate / Payment areas / Can't plant / Worth
  checking.
- **Payment rows:**
  - icon · name · amount or range · small inside-% bar (Progress) · status
    tag · chevron;
  - they expand in place (Collapsible), as in §6.7;
  - a "Not on this land" group lists bonuses checked but not applying.
- **Tag rules:**
  - **Qualifies:** at least 99% of the plantable land is inside the target
    area.
  - **Partly:** touches but less is inside, so a range applies.
  - **Not this land:** doesn't touch.
  - Upkeep is always "Qualifies" when the site meets the minimum.
- **Database change for "Not this land" (answer 3: yes):** `screen_site()`
  must also return the map-based bonuses that were checked but don't apply.
  - List the nature recovery tiers once, as a group, if none touch.
  - List recreational access as not-this-land when its prerequisite (close
    to settlements) doesn't touch.
  - This needs a new migration and the user's hosted `db push` before going
    live, plus new SQL tests.
- **Phone (5a):** the top bar has a menu button opening the sidebar as a
  Sheet, and a search icon. The map is full screen. The detail panel uses
  **shadcn Drawer (vaul)** with three snap points (peek, half, full) and a
  visible handle button for keyboard and screen-reader users.

### 6.6 Addition: redesign the start page as a professional front door
It's the first thing reviewers see. It needs:
- a clear one-line value statement;
- a **preview image or screenshot of the workspace**. One option: take a
  clean desktop screenshot of the redesigned workspace on a test site and
  save it into `public/`, keeping map attribution visible or credited;
- how it works in three steps;
- the region covered;
- a clear **"Check your land"** button.

Use the new design system.

### 6.7 Addition: per-payment "what it entails" breakdown
When a payment row is expanded, show these sections in plain English, each
short:
1. **What it pays:** the rate, how it's calculated for their land, and
   whether it's one-off or yearly. Derived from `rules.ewco_rates` plus the
   result.
2. **Why the government pays it:** one sentence on the public benefit.
3. **Why your land qualifies:** which target area it touches, how much is
   inside, and "Show on map". From the result.
4. **What you'd have to do:** a **checklist**, one line each, of the design
   requirements (species mix, stocking density, open space, shade, public
   access, and so on).
5. **What you're committing to:** duration (15-year maintenance, 30-year
   access) and that the land becomes permanently non-agricultural.
6. **When it's paid:** for example after the final capital claim, or each
   autumn.
7. **Source:** the gov.uk section it comes from and the date checked.

**Storage:** sections 2, 4, 5, 6 and 7 go in database tables with source
links (for example a `rules.payment_details` table plus a requirements
checklist table, keyed by rate code, with `source_url`, `source_section` and
`date_checked`), returned by `screen_site()` for the codes in the result.
They must be updatable without code changes.

**Content rule:** write only from the gov.uk EWCO guidance
(https://www.gov.uk/guidance/england-woodland-creation-offer) and the
Additional contributions page
(https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco).
**Don't invent requirements.** If something isn't stated, leave it out.
- **Not yet done:** an attempt to re-fetch the Additional contributions page
  for verbatim wording was stopped by the user before it ran.
- **Already known from earlier fetches** (summarised in D20, the
  `design_condition` texts in `rules.ewco_rates`, and
  `rules.guidance_steps`): requirements per contribution, timing
  (additional contributions are one-off, after the capital work is
  completed satisfactorily; upkeep each autumn for 15 years, claimed again
  in years 6 and 11; the low sensitivity payment after all other work is
  claimed), 30-year public access, and non-agricultural land registration
  with the RPA.
- **Re-check the pages** before writing the tables.

**Process for the design pass:** build locally. Keep all SQL and front-end
tests passing and add tests for the new database output. Check desktop and
phone in a browser. Log decisions (D53 onwards). **Don't push** until the
user says.

---

## 7. Open items after the design pass
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
