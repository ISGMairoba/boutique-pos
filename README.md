# BoutiquePOS

A white-label, offline-first point of sale for boutiques, kids' stores, shoe and bag shops and beauty stores. One React + TypeScript app on a shared Supabase backend: it runs as a web app, an installable PWA on phones and tablets, and (from Phase 8) a Windows desktop app. Each client business gets its own brand, business-type preset and licence, managed by the platform developer.

"BoutiquePOS" is a working name.

## Status

Phase 0 (foundations) of the [build plan](docs/plan.md):

- pnpm workspace with the web app and shared packages
- Supabase project with the baseline schema, row-level security and licence rules
- Owner sign-in and a home screen listing the account's businesses with their licence state
- CI: Biome, type-check, unit tests, build, and pgTAP tests on a fresh local database

## Layout

| Path | What it holds |
| --- | --- |
| `apps/web` | Vite + React app: routes, screens. Features live under `src/features/<area>`. |
| `packages/domain` | Business rules as pure TypeScript: money, business dates, licences, ranks. No React, no I/O. |
| `packages/ui` | Shared components (shadcn-style), Tailwind theme tokens, and the brand palette builder. |
| `packages/db-types` | Types generated from the Supabase schema. Do not edit by hand. |
| `supabase/migrations` | Database changes in filename order. `20261020190000_baseline.sql` builds everything from zero. |
| `supabase/tests` | pgTAP tests that run in a transaction and roll back. |
| `docs` | Plan and decisions. |

## Run it

Node 22.18 or newer, and pnpm (enable it with `corepack enable`).

```sh
pnpm install
pnpm dev          # web app on http://127.0.0.1:5173
pnpm test         # unit tests (node --test)
pnpm typecheck
pnpm lint         # Biome: formatting and lint
pnpm format       # fix formatting
pnpm build
```

The app reads its backend from `apps/web/.env.development` and `.env.production`. These hold the project URL and the **publishable** key, which are public. Put overrides in `apps/web/.env.local` (git-ignored). Never put a service-role key in a `VITE_` variable.

## Supabase

- Project: `BoutiquePOS` (`qydektyzkobgfucxaroa`, eu-west-1), organization Mairoba Studio.
- Apply new migrations in filename order. Never edit a migration that has already run; add a new file.
- Database tests: `supabase db start && supabase test db` (needs Docker and the Supabase CLI).
- Database types: after a migration, regenerate `packages/db-types/src/database.ts` with
  `supabase gen types typescript --project-id qydektyzkobgfucxaroa > packages/db-types/src/database.ts`.

### Making yourself the platform developer

Sign up once in the Supabase dashboard (Authentication → Users → Add user), then run in the SQL editor:

```sql
insert into private.platform_developers (user_id)
select id from auth.users where email = 'you@example.com';
```

The developer console that uses this role arrives in Phase 1.

## Reference code

Tabeli-Kiddies (WinForms + Access) is the workflow reference for the till. PrintShopLedger is the code reference for offline sync, staff access and branding. Neither is a dependency.
