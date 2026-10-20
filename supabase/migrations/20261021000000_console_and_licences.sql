-- Phase 1: developer console, licence enforcement, devices.
--
-- * The platform developer creates businesses from a preset, with their owner (a Manager), licence
--   and starting settings, and changes licences. Every console change is written to
--   developer_actions.
-- * private.assert_can_write() is the single server-side licence gate. Every function that records
--   sales or changes business records calls it. A read-only or suspended business can still read
--   and export its records.
-- * Devices register once per business (plan device limit applies) and check in to receive a signed
--   licence token from the licence-token Edge Function.

-- When the stored state last changed. Work recorded offline before a business was suspended or made
-- read-only is still accepted when the device syncs later.
alter table public.licences add column state_changed_at timestamptz not null default now();

-- ---------------------------------------------------------------------------------------------
-- Licence and plan helpers
-- ---------------------------------------------------------------------------------------------
create function private.require_platform_developer() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_developer() then
    raise exception 'Only the platform developer can do this.' using errcode = '42501';
  end if;
end $$;

-- Whether the business could sell at a moment. Suspension and read-only apply from the moment they
-- were set; before that, the dates decide.
create function private.licence_allows_at(p_business uuid, p_at timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select public.licence_state_at(
      case when l.state in ('suspended', 'read_only') and p_at < l.state_changed_at then 'active' else l.state end,
      l.valid_until, l.grace_days, p_at
    ) in ('trial', 'active', 'grace')
    from public.licences l
    where l.business_id = p_business
  ), false);
$$;

create function private.assert_can_write(p_business uuid, p_at timestamptz default now()) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.licence_allows_at(p_business, p_at) then
    raise exception 'This business is read-only. Ask your installer to renew the licence.'
      using errcode = 'BPLIC';
  end if;
end $$;

create function private.plan_limit(p_business uuid, p_key text) returns integer
language sql stable security definer set search_path = '' as $$
  select (p.limits ->> p_key)::integer
  from public.licences l join public.plans p on p.id = l.plan_id
  where l.business_id = p_business;
$$;

-- ---------------------------------------------------------------------------------------------
-- Console: who am I, list, create, change licence
-- ---------------------------------------------------------------------------------------------
create function public.am_platform_developer() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_platform_developer();
$$;

create function public.console_businesses()
returns table (
  id uuid, name text, preset_key text, preset_name text, receipt_prefix text, currency text,
  plan_id text, stored_state text, state text, valid_until timestamptz, grace_ends_at timestamptz,
  owner_name text, owner_username text, members integer, devices integer, last_seen_at timestamptz,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_platform_developer();
  return query
  select
    b.id, b.name, b.preset_key, p.name, b.receipt_prefix, b.currency,
    l.plan_id, l.state,
    public.licence_state_at(l.state, l.valid_until, l.grace_days, now()),
    l.valid_until, l.valid_until + make_interval(days => l.grace_days::integer),
    o.display_name, o.username,
    (select count(*)::integer from public.members m where m.business_id = b.id and not m.disabled),
    (select count(*)::integer from public.devices d where d.business_id = b.id and not d.retired),
    (select max(d.last_seen_at) from public.devices d where d.business_id = b.id),
    b.created_at
  from public.businesses b
  join public.presets p on p.key = b.preset_key
  left join public.licences l on l.business_id = b.id
  left join lateral (
    select m.display_name, m.username from public.members m
    where m.business_id = b.id and m.rank = 3 order by m.created_at limit 1
  ) o on true
  order by b.name;
end $$;

create function public.console_create_business(
  p_name text,
  p_preset text,
  p_receipt_prefix text,
  p_plan text,
  p_days integer,
  p_trial boolean,
  p_owner uuid,
  p_owner_username text,
  p_owner_name text,
  p_brand_colour text default '#3346d3',
  p_currency text default 'NGN',
  p_time_zone text default 'Africa/Lagos',
  p_locale text default 'en-NG'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_preset public.presets%rowtype;
  v_business uuid;
  v_settings jsonb;
begin
  perform private.require_platform_developer();

  select * into v_preset from public.presets where key = p_preset;
  if not found then raise exception 'Choose a business type from the list.'; end if;
  if not exists (select 1 from public.plans where id = p_plan and not archived) then
    raise exception 'Choose a plan from the list.';
  end if;
  if p_days is null or p_days not between 1 and 3660 then
    raise exception 'The licence length must be between 1 and 3660 days.';
  end if;
  if p_brand_colour !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Use a brand colour like #7a1f5c.';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'Unknown time zone %.', p_time_zone;
  end if;
  if not exists (select 1 from auth.users where id = p_owner) then
    raise exception 'The owner account does not exist.';
  end if;

  insert into public.businesses (name, preset_key, currency, time_zone, locale, receipt_prefix, created_by)
  values (btrim(p_name), p_preset, upper(p_currency), p_time_zone, p_locale, upper(p_receipt_prefix), auth.uid())
  returning id into v_business;

  insert into public.members (business_id, user_id, rank, username, display_name)
  values (v_business, p_owner, 3, lower(btrim(p_owner_username)), btrim(p_owner_name));

  insert into public.licences (business_id, plan_id, state, valid_until, updated_by)
  values (
    v_business, p_plan, case when p_trial then 'trial' else 'active' end,
    now() + make_interval(days => p_days), auth.uid()
  );

  v_settings := jsonb_build_object(
    'brand', jsonb_build_object('colour', lower(p_brand_colour), 'logo', null),
    'terminology', coalesce(v_preset.defaults -> 'terminology', '{}'::jsonb),
    'receipt', jsonb_build_object('header', '[]'::jsonb, 'footer', coalesce(v_preset.defaults ->> 'receiptFooter', '')),
    'channels', '["Walk-in", "Instagram", "WhatsApp"]'::jsonb,
    'paymentMethods', '["Cash", "POS", "Transfer"]'::jsonb,
    'features', coalesce(v_preset.defaults -> 'features', '{}'::jsonb),
    'catalogueSeed', jsonb_build_object(
      'categories', coalesce(v_preset.defaults -> 'categories', '[]'::jsonb),
      'optionSets', coalesce(v_preset.defaults -> 'optionSets', '[]'::jsonb)
    )
  );
  insert into public.business_settings (business_id, settings, updated_by) values (v_business, v_settings, auth.uid());
  insert into public.business_settings_history (business_id, version, settings, manager_editable, changed_by)
  values (v_business, 1, v_settings, '{}', auth.uid());

  insert into public.developer_actions (business_id, actor, action, details)
  values (v_business, auth.uid(), 'business.create', jsonb_build_object(
    'preset', p_preset, 'plan', p_plan, 'days', p_days, 'trial', p_trial, 'owner', p_owner
  ));
  return v_business;
end $$;

create function public.console_update_licence(
  p_business uuid,
  p_action text,
  p_reason text default null,
  p_valid_until timestamptz default null,
  p_plan text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.licences%rowtype;
  v_after public.licences%rowtype;
begin
  perform private.require_platform_developer();
  select * into v_before from public.licences where business_id = p_business for update;
  if not found then raise exception 'That business has no licence.'; end if;

  if p_action in ('read_only', 'suspend') and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Give a reason. The business owner sees it.';
  end if;

  case p_action
    when 'extend' then
      if p_valid_until is null or p_valid_until <= now() then
        raise exception 'Choose a new expiry date in the future.';
      end if;
      update public.licences set valid_until = p_valid_until, state = 'active',
        state_changed_at = case when state <> 'active' then now() else state_changed_at end,
        updated_by = auth.uid()
      where business_id = p_business;
    when 'change_plan' then
      if not exists (select 1 from public.plans where id = p_plan and not archived) then
        raise exception 'Choose a plan from the list.';
      end if;
      update public.licences set plan_id = p_plan, updated_by = auth.uid() where business_id = p_business;
    when 'read_only' then
      update public.licences set state = 'read_only', state_changed_at = now(), notes = btrim(p_reason),
        updated_by = auth.uid()
      where business_id = p_business;
    when 'suspend' then
      update public.licences set state = 'suspended', state_changed_at = now(), notes = btrim(p_reason),
        updated_by = auth.uid()
      where business_id = p_business;
    when 'restore' then
      update public.licences set state = 'active', state_changed_at = now(), notes = null, updated_by = auth.uid()
      where business_id = p_business;
    else
      raise exception 'Unknown licence action %.', p_action;
  end case;

  select * into v_after from public.licences where business_id = p_business;
  insert into public.developer_actions (business_id, actor, action, reason, details)
  values (p_business, auth.uid(), 'licence.' || p_action, nullif(btrim(coalesce(p_reason, '')), ''),
    jsonb_build_object(
      'before', jsonb_build_object('plan', v_before.plan_id, 'state', v_before.state, 'validUntil', v_before.valid_until),
      'after', jsonb_build_object('plan', v_after.plan_id, 'state', v_after.state, 'validUntil', v_after.valid_until)
    ));
end $$;

-- The console's Edge Function finds an existing account before creating one. Service role only.
create function public.console_user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
$$;

-- ---------------------------------------------------------------------------------------------
-- Devices
-- ---------------------------------------------------------------------------------------------
-- Registers this device with a business, or returns its code if it is already registered.
-- A new device needs a licence that can sell and room under the plan's device limit.
create function public.register_device(p_business uuid, p_device uuid, p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.devices%rowtype;
  v_limit integer;
  v_count integer;
  v_code text;
begin
  if not private.is_member(p_business) then
    raise exception 'You are not a member of this business.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' or length(btrim(p_name)) > 60 then
    raise exception 'Give this device a name of up to 60 characters.';
  end if;

  select * into v_existing from public.devices where id = p_device;
  if found then
    if v_existing.business_id <> p_business then
      raise exception 'This device is registered to another business. Clear this browser''s site data to use it here.';
    end if;
    if v_existing.retired then
      raise exception 'This device was removed from the business. A Manager can add it again.';
    end if;
    return v_existing.code;
  end if;

  perform private.assert_can_write(p_business);
  -- One registration at a time per business, so two devices cannot take the same code.
  perform 1 from public.businesses where id = p_business for update;

  v_limit := private.plan_limit(p_business, 'devices');
  select count(*) into v_count from public.devices where business_id = p_business and not retired;
  if v_limit is not null and v_count >= v_limit then
    raise exception 'This plan allows % devices. Remove a device or ask your installer to upgrade the plan.', v_limit
      using errcode = 'BPLIM';
  end if;

  select lpad((coalesce(max(code::integer), 0) + 1)::text, 2, '0') into v_code
  from public.devices where business_id = p_business;
  if v_code::integer > 99 then raise exception 'This business has used all 99 device codes.'; end if;

  insert into public.devices (id, business_id, code, name, created_by)
  values (p_device, p_business, v_code, btrim(p_name), auth.uid());
  return v_code;
end $$;

-- Records a check-in and returns what the licence token carries. Works for read-only and suspended
-- businesses too, so their devices learn their state.
create function public.device_check_in(p_business uuid, p_device uuid)
returns table (
  business_id uuid, device_id uuid, device_code text, plan_id text, state text, state_changed_at timestamptz,
  valid_until timestamptz, grace_days smallint, max_offline_days smallint, checked_in_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member(p_business) then
    raise exception 'You are not a member of this business.' using errcode = '42501';
  end if;
  update public.devices d set last_seen_at = now()
  where d.id = p_device and d.business_id = p_business and not d.retired;
  if not found then raise exception 'Register this device first.'; end if;

  return query
  select p_business, p_device, d.code, l.plan_id, l.state, l.state_changed_at, l.valid_until, l.grace_days,
    l.max_offline_days, now()
  from public.devices d join public.licences l on l.business_id = d.business_id
  where d.id = p_device;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_platform_developer(),
  private.is_member(uuid),
  private.member_rank(uuid),
  private.can_read(uuid)
to authenticated;
grant execute on function
  public.licence_state_at(text, timestamptz, integer, timestamptz),
  public.business_licence(uuid),
  public.am_platform_developer(),
  public.console_businesses(),
  public.console_create_business(text, text, text, text, integer, boolean, uuid, text, text, text, text, text, text),
  public.console_update_licence(uuid, text, text, timestamptz, text),
  public.register_device(uuid, uuid, text),
  public.device_check_in(uuid, uuid)
to authenticated;
revoke execute on function public.console_user_id_by_email(text) from authenticated;
grant execute on function public.console_user_id_by_email(text) to service_role;
