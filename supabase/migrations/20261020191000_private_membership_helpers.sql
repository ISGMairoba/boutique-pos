-- Membership helpers are only needed inside policies and server functions, so they move out of the
-- API schema: signed-in users can no longer call them as /rest/v1/rpc endpoints. Policies refer to
-- functions by identity, so existing policies keep working after the move. Bodies that name
-- another helper are recreated with the new schema. business_licence stays in public on purpose:
-- the app reads it, and it checks membership itself.

alter function public.is_platform_developer() set schema private;
alter function public.is_member(uuid) set schema private;
alter function public.member_rank(uuid) set schema private;
alter function public.can_read(uuid) set schema private;

create or replace function private.can_read(p_business uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_member(p_business) or private.is_platform_developer();
$$;

create or replace function public.business_licence(p_business uuid)
returns table (
  plan_id text, state text, valid_until timestamptz, grace_ends_at timestamptz,
  max_offline_days smallint, can_sell boolean
)
language sql stable security definer set search_path = '' as $$
  select
    l.plan_id,
    public.licence_state_at(l.state, l.valid_until, l.grace_days, now()),
    l.valid_until,
    l.valid_until + make_interval(days => l.grace_days::integer),
    l.max_offline_days,
    public.licence_state_at(l.state, l.valid_until, l.grace_days, now()) in ('trial', 'active', 'grace')
  from public.licences l
  where l.business_id = p_business and private.can_read(p_business);
$$;

-- Policies run as the signed-in user, so they need to reach the helpers. Tables and sequences in
-- private have no grants, so schema usage exposes only these functions.
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_platform_developer(),
  private.is_member(uuid),
  private.member_rank(uuid),
  private.can_read(uuid)
to authenticated;

-- Foreign keys the app joins or deletes through.
create index businesses_preset_key on public.businesses(preset_key);
create index licences_plan_id on public.licences(plan_id);
create index events_device_id on public.events(device_id);
