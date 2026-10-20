# Working on BoutiquePOS

Read README.md for layout and commands, and docs/plan.md for scope. These rules hold everywhere.

## Product rules

- Nothing about a client is hard-coded. Names, colours, labels, receipt text, channels, payment methods and features come from business settings or presets.
- A sale is a fact. Once money is taken it is saved locally in one step and accepted by the server later, even with negative stock or a changed price. Flag problems; never reject the sale.
- Money is a whole number of minor units (`Minor` in `packages/domain/src/money.ts`) with the business currency beside it. Format only for display. No floats for amounts, no numeric columns for money.
- Business days use the business time zone (`businessDate()`), never the device's.

## Code rules

- Business rules go in `packages/domain` as pure functions with tests beside them (`*.test.ts`, run with `node --test`). Screens call them; they do not re-implement them.
- TypeScript is strict and erasable-only (no enums, namespaces or parameter properties) so Node can run the tests without a build. Import local files with their `.ts`/`.tsx` extension.
- UI uses Tailwind classes built on the tokens in `packages/ui/src/theme.css`. Use semantic colours (`bg-primary`, `text-muted-foreground`, `bg-warning-soft`), never raw hex values in components. Brand colours change at runtime through `applyBrand()`.
- Words people see should be plain and specific. Errors say what happened and what to do.
- Run `pnpm format` before committing; CI runs `biome ci`.

## Database rules

- Every business table has `business_id`, row-level security, and a select policy using `private.can_read(business_id)`. Manager-only tables use `private.member_rank(business_id) >= 3`.
- Clients never write tables. Writes go through `security definer` functions with `set search_path = ''` that check membership, rank and licence.
- Every function that records sales or changes business records calls `private.assert_can_write(business_id, <when the work happened>)`, so read-only and suspended businesses keep reading but stop writing, while offline work done before a suspension is still accepted.
- Platform-developer functions start with `perform private.require_platform_developer();` and write a row to `developer_actions`.
- Edge Functions check the caller's sign-in themselves (`verify_jwt = false`): the project uses asymmetric JWT signing keys. The licence-token format is shared with `packages/domain/src/licence-token.ts`; change both together.
- Default privileges are revoked. Every new table needs `grant select ... to authenticated`; every function callable from the app needs an explicit `grant execute`. Helpers used only by policies live in `private`.
- Synced tables get a `seq bigint` column and a `private.next_seq()` trigger.
- `public.licence_state_at()` and `licenceStateAt()` in `packages/domain` must agree; change both together with their tests.
- Never edit a migration that has run. Add a new one, apply it, regenerate `packages/db-types`, and add or update pgTAP tests in `supabase/tests`.
