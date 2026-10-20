-- Private key the licence-token Edge Function signs with. The key itself is inserted outside
-- migrations (never committed). Only the service role can read it; the matching public key is
-- built into the app as VITE_LICENCE_PUBLIC_KEY.
create table private.licence_signing_keys (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  private_jwk jsonb not null,
  public_jwk jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index licence_signing_keys_one_active on private.licence_signing_keys (active) where active;
alter table private.licence_signing_keys enable row level security;
revoke all on private.licence_signing_keys from public, anon, authenticated;

create function public.licence_signing_key() returns jsonb
language sql stable security definer set search_path = '' as $$
  select private_jwk from private.licence_signing_keys where active;
$$;
revoke execute on function public.licence_signing_key() from public, anon, authenticated;
grant execute on function public.licence_signing_key() to service_role;
