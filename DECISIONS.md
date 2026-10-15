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
