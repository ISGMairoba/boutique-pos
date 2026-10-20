-- BoutiquePOS baseline. Builds an empty database from zero:
-- platform (developers, plans, presets), businesses, membership, licences, settings, devices,
-- applied events, audit trail, and developer actions.
--
-- Rules every later migration follows:
--   * Every business table has business_id, row-level security, and is read through can_read().
--   * Clients never write tables directly. Writes go through security definer functions with
--     search_path = '' that check membership, rank and licence.
--   * Grants are explicit: default privileges are revoked below, so grant select (and execute on
--     functions) to authenticated deliberately.
--   * Synced tables get a seq number from private.sync_seq on every insert and update; devices
--     pull rows with seq above their cursor.
--   * Money is bigint minor units; amounts never use numeric/float columns.

-- ---------------------------------------------------------------------------------------------
-- Schemas and default privileges
-- ---------------------------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------------------------
create sequence private.sync_seq;

create function private.next_seq() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.seq := nextval('private.sync_seq');
  return new;
end $$;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

revoke all on function private.next_seq(), private.touch_updated_at() from public;

-- ---------------------------------------------------------------------------------------------
-- Platform: developers, plans, presets
-- ---------------------------------------------------------------------------------------------
create table private.platform_developers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

create function public.is_platform_developer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.platform_developers d where d.user_id = (select auth.uid()));
$$;

create table public.plans (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.plans (id, name, limits) values
  ('trial', 'Trial', '{"devices": 2, "staff": 5, "products": 200}'),
  ('starter', 'Starter', '{"devices": 2, "staff": 5, "products": 2000}'),
  ('standard', 'Standard', '{"devices": 5, "staff": 15, "products": 10000}');

create table public.presets (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  defaults jsonb not null check (jsonb_typeof(defaults) = 'object'),
  sort smallint not null default 0
);

insert into public.presets (key, name, sort, defaults) values
  ('fashion', 'Fashion boutique', 1, $j${
    "categories": ["Dresses", "Tops", "Trousers", "Skirts", "Outerwear", "Accessories"],
    "optionSets": [
      {"name": "Size", "values": ["XS", "S", "M", "L", "XL", "XXL"]},
      {"name": "Colour", "values": []}
    ],
    "terminology": {"product": "Style", "products": "Styles"},
    "features": {"variants": true, "exchanges": true, "batches": false},
    "receiptFooter": "Exchanges within 7 days with this receipt"
  }$j$),
  ('kids', 'Kids & baby store', 2, $j${
    "categories": ["Babywear", "Girls", "Boys", "Shoes", "Toys", "Feeding", "Accessories"],
    "optionSets": [
      {"name": "Age size", "values": ["0-3M", "3-6M", "6-12M", "12-18M", "18-24M", "2-3Y", "3-4Y", "4-5Y", "5-6Y", "7-8Y", "9-10Y", "11-12Y"]},
      {"name": "Colour", "values": []}
    ],
    "terminology": {"product": "Item", "products": "Items"},
    "features": {"variants": true, "exchanges": true, "batches": false, "giftReceipts": true},
    "receiptFooter": "Exchanges within 7 days with this receipt"
  }$j$),
  ('shoes', 'Shoes & bags', 3, $j${
    "categories": ["Men's shoes", "Women's shoes", "Kids' shoes", "Bags", "Belts", "Shoe care"],
    "optionSets": [
      {"name": "Size", "values": ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"]},
      {"name": "Colour", "values": []},
      {"name": "Material", "values": ["Leather", "Suede", "Canvas", "Synthetic"]}
    ],
    "terminology": {"product": "Product", "products": "Products"},
    "features": {"variants": true, "exchanges": true, "batches": false, "sizeGridReceiving": true},
    "receiptFooter": "Unworn items may be exchanged within 7 days"
  }$j$),
  ('beauty', 'Cosmetics & beauty', 4, $j${
    "categories": ["Makeup", "Skincare", "Haircare", "Fragrance", "Tools"],
    "optionSets": [
      {"name": "Shade", "values": []},
      {"name": "Size", "values": []}
    ],
    "terminology": {"product": "Product", "products": "Products"},
    "features": {"variants": true, "exchanges": false, "batches": true, "expiryAlerts": true},
    "receiptFooter": "Opened items cannot be returned"
  }$j$);

-- ---------------------------------------------------------------------------------------------
-- Businesses and membership
-- ---------------------------------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  preset_key text not null references public.presets(key),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  time_zone text not null default 'Africa/Lagos' check (length(time_zone) between 1 and 64),
  locale text not null default 'en-NG' check (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  receipt_prefix text not null check (receipt_prefix ~ '^[A-Z0-9]{1,6}$'),
  seq bigint not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rank smallint not null check (rank between 1 and 4),
  disabled boolean not null default false,
  username text not null check (username ~ '^[a-z0-9._-]{3,32}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id),
  unique (business_id, username)
);
create index members_user_id on public.members(user_id);

-- Membership helpers used by every policy. security definer so policies on members itself do not
-- recurse; each reads only the caller's own rows.
create function public.is_member(p_business uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.business_id = p_business and m.user_id = (select auth.uid()) and not m.disabled
  );
$$;

create function public.member_rank(p_business uuid) returns smallint
language sql stable security definer set search_path = '' as $$
  select m.rank from public.members m
  where m.business_id = p_business and m.user_id = (select auth.uid()) and not m.disabled;
$$;

create function public.can_read(p_business uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_member(p_business) or public.is_platform_developer();
$$;

-- ---------------------------------------------------------------------------------------------
-- Licences
-- ---------------------------------------------------------------------------------------------
create table public.licences (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  plan_id text not null references public.plans(id),
  state text not null check (state in ('trial', 'active', 'read_only', 'suspended')),
  valid_until timestamptz not null,
  grace_days smallint not null default 7 check (grace_days between 0 and 60),
  max_offline_days smallint not null default 7 check (max_offline_days between 1 and 30),
  notes text check (length(notes) <= 2000),
  seq bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Mirrors licenceStateAt() in packages/domain/src/licence.ts. Grace is never stored.
create function public.licence_state_at(
  p_state text, p_valid_until timestamptz, p_grace_days integer, p_at timestamptz
) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_state in ('suspended', 'read_only') then p_state
    when p_at <= p_valid_until then p_state
    when p_at <= p_valid_until + make_interval(days => p_grace_days) then 'grace'
    else 'read_only'
  end;
$$;

create function public.business_licence(p_business uuid)
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
  where l.business_id = p_business and public.can_read(p_business);
$$;

-- ---------------------------------------------------------------------------------------------
-- Settings and devices
-- ---------------------------------------------------------------------------------------------
create table public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  -- Settings tabs a Manager may edit, chosen by the platform developer.
  manager_editable text[] not null default '{}',
  seq bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.business_settings_history (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  version integer not null,
  settings jsonb not null,
  manager_editable text[] not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index business_settings_history_business on public.business_settings_history(business_id, version);

create table public.devices (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null check (code ~ '^[0-9]{2}$'),
  name text not null check (length(btrim(name)) between 1 and 60),
  receipt_seq bigint not null default 0 check (receipt_seq >= 0),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  retired boolean not null default false,
  last_seen_at timestamptz,
  seq bigint not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, code)
);

-- ---------------------------------------------------------------------------------------------
-- Integrity: applied events, audit trail, developer actions
-- ---------------------------------------------------------------------------------------------
create table public.events (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]+\.[a-z_]+$'),
  payload jsonb not null,
  device_id uuid references public.devices(id) on delete set null,
  actor uuid not null references auth.users(id),
  client_created_at timestamptz not null,
  applied_at timestamptz not null default now(),
  outcome text not null default 'applied' check (outcome in ('applied', 'flagged')),
  flag_reason text check (length(flag_reason) <= 500),
  seq bigint not null default 0
);
create index events_business_seq on public.events(business_id, seq);

create table public.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor uuid references auth.users(id) on delete set null,
  action text not null check (length(btrim(action)) between 1 and 80),
  table_name text not null,
  record_id text,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index audit_log_business_at on public.audit_log(business_id, at desc);

create table public.developer_actions (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses(id) on delete set null,
  actor uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'business.create', 'licence.extend', 'licence.change_plan', 'licence.read_only',
    'licence.suspend', 'licence.restore', 'settings.change', 'support.access'
  )),
  reason text check (length(reason) <= 1000),
  details jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index developer_actions_business_at on public.developer_actions(business_id, at desc);

-- ---------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------
create trigger businesses_seq before insert or update on public.businesses
  for each row execute function private.next_seq();
create trigger members_seq before insert or update on public.members
  for each row execute function private.next_seq();
create trigger licences_seq before insert or update on public.licences
  for each row execute function private.next_seq();
create trigger business_settings_seq before insert or update on public.business_settings
  for each row execute function private.next_seq();
create trigger devices_seq before insert or update on public.devices
  for each row execute function private.next_seq();
create trigger events_seq before insert or update on public.events
  for each row execute function private.next_seq();

create trigger businesses_touch before update on public.businesses
  for each row execute function private.touch_updated_at();
create trigger members_touch before update on public.members
  for each row execute function private.touch_updated_at();
create trigger licences_touch before update on public.licences
  for each row execute function private.touch_updated_at();
create trigger business_settings_touch before update on public.business_settings
  for each row execute function private.touch_updated_at();
create trigger devices_touch before update on public.devices
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Row-level security and grants
-- ---------------------------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.presets enable row level security;
alter table public.businesses enable row level security;
alter table public.members enable row level security;
alter table public.licences enable row level security;
alter table public.business_settings enable row level security;
alter table public.business_settings_history enable row level security;
alter table public.devices enable row level security;
alter table public.events enable row level security;
alter table public.audit_log enable row level security;
alter table public.developer_actions enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on
  public.plans, public.presets, public.businesses, public.members, public.licences,
  public.business_settings, public.business_settings_history, public.devices, public.events,
  public.audit_log, public.developer_actions
to authenticated;

create policy signed_in_read on public.plans for select to authenticated using (true);
create policy signed_in_read on public.presets for select to authenticated using (true);
create policy member_read on public.businesses for select to authenticated using (public.can_read(id));
create policy member_read on public.members for select to authenticated using (public.can_read(business_id));
create policy member_read on public.licences for select to authenticated using (public.can_read(business_id));
create policy member_read on public.business_settings for select to authenticated
  using (public.can_read(business_id));
create policy member_read on public.devices for select to authenticated using (public.can_read(business_id));
create policy manager_read on public.business_settings_history for select to authenticated
  using (coalesce(public.member_rank(business_id), 0) >= 3 or public.is_platform_developer());
create policy manager_read on public.events for select to authenticated
  using (coalesce(public.member_rank(business_id), 0) >= 3 or public.is_platform_developer());
create policy manager_read on public.audit_log for select to authenticated
  using (coalesce(public.member_rank(business_id), 0) >= 3 or public.is_platform_developer());
create policy developer_read on public.developer_actions for select to authenticated
  using ((select public.is_platform_developer()));

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  public.is_platform_developer(),
  public.is_member(uuid),
  public.member_rank(uuid),
  public.can_read(uuid),
  public.licence_state_at(text, timestamptz, integer, timestamptz),
  public.business_licence(uuid)
to authenticated;
