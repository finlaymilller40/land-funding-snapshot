# Land Funding Snapshot

A web app where a landowner in England draws or uploads their land and gets a
plain-English summary of which nature funding schemes it may qualify for
(starting with the England Woodland Creation Offer), how much it could earn,
and what to do next.

**Principle:** the database and code decide eligibility and money; AI only
explains the results.

> Portfolio prototype. Not financial or legal advice.

## Status

Phase 0: empty pipeline. The home page reads one test row from Supabase to
prove Next.js → Supabase → Vercel works end to end.

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

## Decisions

See [DECISIONS.md](DECISIONS.md).
