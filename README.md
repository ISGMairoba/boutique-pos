# BoutiquePOS

A white-label, offline-first point of sale for boutiques, kids' stores, shoe and bag shops and beauty stores. One React + TypeScript app on a shared Supabase backend: it runs as a web app, an installable PWA on phones and tablets, and (from Phase 8) a Windows desktop app. Each client business gets its own brand, business-type preset and licence, managed by the platform developer.

"BoutiquePOS" is a working name.

## Status

Phases 0 and 1 of the [build plan](docs/plan.md) are done:

- pnpm workspace with the web app and shared packages; CI runs Biome, type-check, unit tests, build and pgTAP
- Supabase schema with row-level security; every business is isolated from the others
- Developer console: create a business from a preset with its owner and licence; extend, change plan,
  make read-only, suspend or restore; every change is recorded
- Licences enforced on the server (`private.assert_can_write`) and on devices through signed licence tokens
  that work offline for up to 7 days
- Owner sign-in with a forced password change after a temporary password; a business page showing the
  licence state and this device's number

## Layout

| Path | What it holds |
| --- | --- |
| `apps/web` | Vite + React app: routes, screens. Features live under `src/features/<area>`. |
| `packages/domain` | Business rules as pure TypeScript: money, business dates, licences and licence tokens, ranks. No React, no I/O. |
| `packages/ui` | Shared components (shadcn-style), Tailwind theme tokens, and the brand palette builder. |
| `packages/db-types` | Types generated from the Supabase schema. Do not edit by hand. |
| `supabase/migrations` | Database changes in filename order. `20261020190000_baseline.sql` builds everything from zero. |
| `supabase/tests` | pgTAP tests that run in a transaction and roll back. |
| `supabase/functions` | Edge Functions (Deno). |
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

## Hosting (Vercel)

- Live: https://boutique-pos-kappa.vercel.app (project `boutique-pos`, team isgmairoba).
- Every push to `main` deploys to production; other branches get preview deployments, which need a Vercel login to view.
- Project settings: root directory `apps/web`, framework Vite, Node 22, install `pnpm install --no-frozen-lockfile`, build `pnpm run build`, output `dist`.
- `ENABLE_EXPERIMENTAL_COREPACK=1` makes Vercel use the pnpm version pinned in `package.json`. Without it, Vercel falls back to an old pnpm that fails on Node 22.
- `apps/web/vercel.json` sends every path to `index.html` so links into the app work.
- Once `pnpm-lock.yaml` is committed, change the install command back to plain `pnpm install`.

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

Then sign in to the app: a Console link appears in the header.

### Creating a business

Console → New business. If the owner's email has no account, one is created with a temporary password
that is shown once; pass it on and the owner chooses their own password at first sign-in. No email is
sent, so this works without custom SMTP.

### Edge Functions

| Function | What it does |
| --- | --- |
| `console-create-business` | Platform developer only. Creates the owner account if needed, then the business. |
| `licence-token` | Registers the calling device (plan device limit applies) and returns a signed licence token. |

Both check the caller's sign-in themselves (`verify_jwt = false` in `supabase/config.toml`), because the
project uses asymmetric JWT signing keys. Deploy with `supabase functions deploy <name>`.

### Licence signing key

Licence tokens are signed with an ECDSA P-256 key. The private key lives only in
`private.licence_signing_keys` (readable by the service role through `public.licence_signing_key()`); it is
never committed. The public key is `VITE_LICENCE_PUBLIC_KEY` in `apps/web/.env.production`.

To rotate: generate a new key pair, insert it with `active = true` after setting the old row to
`active = false`, and ship the new public key in the same release. Devices holding a token signed by the
old key check in again the next time they are online.

## Reference code

Tabeli-Kiddies (WinForms + Access) is the workflow reference for the till. PrintShopLedger is the code reference for offline sync, staff access and branding. Neither is a dependency.
