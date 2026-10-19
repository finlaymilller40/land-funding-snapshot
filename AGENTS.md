<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Land Funding Snapshot: notes for coding agents

Start with `HANDOFF.md`: current status, how we work, and the agreed next
steps. `DECISIONS.md` records every decision (D1 onwards); add new ones
there.

## Rules
- Ask the user, in plain chat text with numbered options and a
  recommendation, before any design decision not in their brief. Don't use
  pop-up question dialogs.
- The database and code decide eligibility and money. AI only explains.
  Rates, rules and gov.uk wording live in the private `rules` schema with
  source links and a date checked, never hard-coded.
- The `layers` and `rules` schemas are private. Only `public.screen_site()`,
  `public.site_context()` and `public.region_outline()` are callable by
  anon (SECURITY DEFINER, pinned `search_path`, fail closed on missing data
  or settings).
- Secret-scan before every commit. Never commit `.env*`, `data/` or
  `public/vendor/`.
- Never push to GitHub (which deploys on Vercel) or change the hosted
  Supabase database without the user's explicit OK. The user runs
  `npx supabase db push`, hosted `npm run load-layers` and
  `./scripts/verify_hosted.sh`, because they need the database password.
- Write migrations as new files named with a UTC timestamp. Don't edit
  migrations already applied to the hosted database.
- Keep tests passing:
  - `scripts/sql/verify_load.sql`;
  - `scripts/sql/test_screen_site.sql`;
  - `scripts/sql/test_explain_context.sql`;
  - `scripts/sql/test_payment_details.sql`;
  - `scripts/sql/test_small_pieces.sql`;
  - `npx tsc --noEmit -p .`, `npx eslint src scripts`, `npm run build`.

  Check UI changes in a browser at desktop and phone widths.

## Layout
- `supabase/migrations/`: schema, rules data, the public functions.
- `scripts/load_layers.ts`: loads open data. Configured by
  `config/layers.json` and `config/regions/`.
- `src/components/Workspace.tsx` (state and flow), `AppShell.tsx` (top bar,
  sidebar views, phone drawer), `WorkspaceMap.tsx` (MapLibre and Terra
  Draw), `ResultsPanel.tsx` and `PaymentRow.tsx` (detail panel),
  `MapLegend.tsx`, `InfoViews.tsx`. shadcn/ui components live in
  `src/components/ui`; class merging is `cn` from `src/lib/utils.ts`.
- `src/lib/screen.ts` (result types and RPC calls), `src/lib/wording.ts`
  (plain-English titles, colours, icons, status tags, summary),
  `src/lib/patterns.ts` (hatch patterns for land that can't be planted).
