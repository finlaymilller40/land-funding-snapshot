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
works end to end.

**Phase 1 (open data layers): loaded locally, 2026-10-15.** Twelve open
layers for Cambridgeshire and Peterborough sit in a private `layers` schema.
`layers.site_overlaps(polygon)` lists every layer a site overlaps, with the
area in hectares, in milliseconds. Not yet pushed to the hosted database.

## Stack

- Next.js (TypeScript, App Router, Tailwind CSS) on Vercel
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

Then `npm run dev` and open http://localhost:3000.

Never put the service role key in `.env.local` or any front-end code.

## Database changes

Migrations live in `supabase/migrations/`. Create one with
`npx supabase migration new <name>`, apply it locally with
`npx supabase db reset`, and push it to the hosted project with
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

### Data sources and attribution

Each layer's source URL, licence and attribution text is recorded in
`layers.sources` (and `config/layers.json`). Data from Natural England,
Historic England, the Forestry Commission and ONS is used under the Open
Government Licence v3.0. **England Peat Status is under the Non-Commercial
Government Licence v2.0**: non-commercial use only.

## Decisions

See [DECISIONS.md](DECISIONS.md).
