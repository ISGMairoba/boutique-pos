-- Phase 2: saving business and device settings, and brand logos.
--
-- * private.check_business_settings() applies the rules of validateSettings() in
--   packages/domain/src/settings.ts; change both together.
-- * save_business_settings() saves a whole settings document at the version the editor loaded, so two
--   people editing at once cannot overwrite each other. Managers may change only the tabs the platform
--   developer allowed (business_settings.manager_editable); features and the catalogue seed belong to
--   the platform developer and a business Developer.
-- * Logos live in the public "brand-assets" bucket under "<business id>/". Receipts and screens show
--   them, so they are public by design; only people allowed to edit the brand can upload.

-- ---------------------------------------------------------------------------------------------
-- Validation
-- ---------------------------------------------------------------------------------------------
create function private.check_settings_list(p_list jsonb, p_label text) returns void
language plpgsql immutable set search_path = '' as $$
declare
  v_item jsonb;
  v_seen text[] := '{}';
  v_text text;
begin
  if jsonb_typeof(p_list) is distinct from 'array' then raise exception 'Add at least one %.', p_label; end if;
  if jsonb_array_length(p_list) = 0 then raise exception 'Add at least one %.', p_label; end if;
  if jsonb_array_length(p_list) > 12 then raise exception 'Use at most 12 %s.', p_label; end if;
  for v_item in select * from jsonb_array_elements(p_list) loop
    if jsonb_typeof(v_item) is distinct from 'string' then raise exception 'Each % must be text.', p_label; end if;
    v_text := btrim(v_item #>> '{}');
    if v_text = '' then raise exception 'A % cannot be empty.', p_label; end if;
    if length(v_text) > 30 then raise exception '"%" is longer than 30 characters.', left(v_text, 20); end if;
    if lower(v_text) = any (v_seen) then raise exception '"%" is listed twice.', v_text; end if;
    v_seen := v_seen || lower(v_text);
  end loop;
end $$;

create function private.check_business_settings(p_business uuid, p_settings jsonb) returns void
language plpgsql stable set search_path = '' as $$
declare
  v_key text;
  v_value jsonb;
  v_path text;
begin
  if jsonb_typeof(p_settings) is distinct from 'object' then raise exception 'Settings must be an object.'; end if;
  for v_key in select jsonb_object_keys(p_settings) loop
    if v_key not in ('brand', 'terminology', 'receipt', 'channels', 'paymentMethods', 'features', 'catalogueSeed') then
      raise exception 'Unknown setting "%".', v_key;
    end if;
  end loop;

  -- brand
  if coalesce(p_settings #>> '{brand,colour}', '') !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Use a brand colour like #7a1f5c.';
  end if;
  if jsonb_typeof(p_settings #> '{brand,logo}') = 'object' then
    foreach v_key in array array['screen', 'receipt'] loop
      v_path := p_settings #>> array['brand', 'logo', v_key];
      if v_path is null and v_key = 'receipt' then continue; end if;
      if v_path is null or left(v_path, 37) <> p_business::text || '/' or length(v_path) > 200 then
        raise exception 'Upload the logo again.';
      end if;
    end loop;
  elsif coalesce(jsonb_typeof(p_settings #> '{brand,logo}'), 'null') <> 'null' then
    raise exception 'Upload the logo again.';
  end if;

  -- terminology
  if p_settings ? 'terminology' then
    if jsonb_typeof(p_settings -> 'terminology') is distinct from 'object' then raise exception 'Wording must be a list of words.'; end if;
    for v_key, v_value in select * from jsonb_each(p_settings -> 'terminology') loop
      if v_key not in ('product', 'products', 'customer', 'customers', 'receipt', 'till', 'cashier', 'category', 'categories') then
        raise exception '"%" is not a word the app uses.', v_key;
      end if;
      if jsonb_typeof(v_value) is distinct from 'string' or btrim(v_value #>> '{}') = '' or length(btrim(v_value #>> '{}')) > 30 then
        raise exception 'Use 1 to 30 characters for each word.';
      end if;
    end loop;
  end if;

  -- receipt
  if jsonb_typeof(p_settings -> 'receipt') is distinct from 'object' then raise exception 'Receipt settings are missing.'; end if;
  if jsonb_typeof(p_settings #> '{receipt,header}') is distinct from 'array' then raise exception 'Receipt header must be a list of lines.'; end if;
  if jsonb_array_length(p_settings #> '{receipt,header}') > 6 then raise exception 'Use at most 6 header lines.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_settings #> '{receipt,header}') line
    where jsonb_typeof(line) is distinct from 'string' or length(line #>> '{}') > 48
  ) then
    raise exception 'Each header line must be text of up to 48 characters.';
  end if;
  if jsonb_typeof(p_settings #> '{receipt,footer}') is distinct from 'string' or length(p_settings #>> '{receipt,footer}') > 300 then
    raise exception 'Keep the footer under 300 characters.';
  end if;
  if array_length(string_to_array(p_settings #>> '{receipt,footer}', E'\n'), 1) > 6 then
    raise exception 'Use at most 6 footer lines.';
  end if;
  foreach v_key in array array['showLogo', 'showCashier', 'showCustomer', 'showBarcode'] loop
    if p_settings -> 'receipt' ? v_key and jsonb_typeof(p_settings -> 'receipt' -> v_key) is distinct from 'boolean' then
      raise exception 'Choose whether the receipt shows %.', v_key;
    end if;
  end loop;

  -- lists
  perform private.check_settings_list(p_settings -> 'channels', 'sales channel');
  perform private.check_settings_list(p_settings -> 'paymentMethods', 'payment method');

  -- features
  if p_settings ? 'features' then
    if jsonb_typeof(p_settings -> 'features') is distinct from 'object' then raise exception 'Features can only be switched on or off.'; end if;
    for v_key, v_value in select * from jsonb_each(p_settings -> 'features') loop
      if v_key !~ '^[a-zA-Z]{1,40}$' or jsonb_typeof(v_value) is distinct from 'boolean' then
        raise exception 'Features can only be switched on or off.';
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Who may edit what
-- ---------------------------------------------------------------------------------------------
-- The stored settings key each tab owns, matching TAB_KEYS in packages/domain/src/settings.ts.
create function private.settings_tab_key(p_tab text) returns text
language sql immutable set search_path = '' as $$
  select case p_tab
    when 'brand' then 'brand'
    when 'terminology' then 'terminology'
    when 'receipt' then 'receipt'
    when 'channels' then 'channels'
    when 'payments' then 'paymentMethods'
  end;
$$;

-- Whether the caller may change one stored settings key ('name' is the business name, on the brand tab).
create function private.can_edit_setting(p_business uuid, p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_platform_developer()
    or coalesce(private.member_rank(p_business), 0) = 4
    or (
      coalesce(private.member_rank(p_business), 0) = 3
      and exists (
        select 1 from public.business_settings s, unnest(s.manager_editable) tab
        where s.business_id = p_business
          and private.settings_tab_key(tab) = case when p_key = 'name' then 'brand' else p_key end
      )
    );
$$;

-- ---------------------------------------------------------------------------------------------
-- Saving
-- ---------------------------------------------------------------------------------------------
create function public.save_business_settings(
  p_business uuid,
  p_version integer,
  p_settings jsonb,
  p_name text default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_current public.business_settings%rowtype;
  v_old_name text;
  v_key text;
  v_changed text[] := '{}';
  v_version integer;
begin
  if not (private.is_platform_developer() or coalesce(private.member_rank(p_business), 0) >= 3) then
    raise exception 'Only a Manager can change business settings.' using errcode = '42501';
  end if;
  perform private.assert_can_write(p_business);

  select * into v_current from public.business_settings where business_id = p_business for update;
  if not found then raise exception 'This business has no settings yet.'; end if;
  if v_current.version <> p_version then
    raise exception 'These settings were changed on another device. Reload them and make your change again.'
      using errcode = 'BPVER';
  end if;

  perform private.check_business_settings(p_business, p_settings);

  for v_key in select jsonb_object_keys(v_current.settings || p_settings) loop
    if v_current.settings -> v_key is distinct from p_settings -> v_key then v_changed := v_changed || v_key; end if;
  end loop;
  select name into v_old_name from public.businesses where id = p_business;
  if p_name is not null and btrim(p_name) <> v_old_name then
    if length(btrim(p_name)) not between 1 and 120 then raise exception 'Use a business name of 1 to 120 characters.'; end if;
    v_changed := v_changed || 'name'::text;
  end if;

  foreach v_key in array v_changed loop
    if not private.can_edit_setting(p_business, v_key) then
      raise exception 'You cannot change % settings. Ask your installer to allow it.',
        case v_key when 'paymentMethods' then 'payment method' when 'catalogueSeed' then 'catalogue' else v_key end
        using errcode = '42501';
    end if;
  end loop;

  if cardinality(v_changed) = 0 then return v_current.version; end if;

  v_version := v_current.version + 1;
  update public.business_settings
  set settings = p_settings, version = v_version, updated_by = auth.uid()
  where business_id = p_business;
  if 'name' = any (v_changed) then
    update public.businesses set name = btrim(p_name) where id = p_business;
  end if;

  insert into public.business_settings_history (business_id, version, settings, manager_editable, changed_by)
  values (p_business, v_version, p_settings, v_current.manager_editable, auth.uid());
  insert into public.audit_log (business_id, actor, action, table_name, record_id, before, after)
  values (
    p_business, auth.uid(), 'settings.update', 'business_settings', p_business::text,
    jsonb_build_object('version', v_current.version, 'changed', to_jsonb(v_changed), 'name', v_old_name),
    jsonb_build_object('version', v_version, 'name', coalesce(btrim(p_name), v_old_name))
  );
  if private.is_platform_developer() and not private.is_member(p_business) then
    insert into public.developer_actions (business_id, actor, action, details)
    values (p_business, auth.uid(), 'settings.change', jsonb_build_object('changed', to_jsonb(v_changed), 'version', v_version));
  end if;
  return v_version;
end $$;

-- Platform developer: which settings tabs this business's Managers may change.
create function public.console_set_manager_editable(p_business uuid, p_tabs text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_before text[];
  v_tabs text[];
begin
  perform private.require_platform_developer();
  select coalesce(array_agg(distinct tab order by tab), '{}') into v_tabs from unnest(coalesce(p_tabs, '{}')) tab;
  if exists (select 1 from unnest(v_tabs) tab where private.settings_tab_key(tab) is null) then
    raise exception 'Unknown settings tab.';
  end if;
  select manager_editable into v_before from public.business_settings where business_id = p_business for update;
  if not found then raise exception 'This business has no settings yet.'; end if;
  update public.business_settings set manager_editable = v_tabs where business_id = p_business;
  insert into public.developer_actions (business_id, actor, action, details)
  values (p_business, auth.uid(), 'settings.change',
    jsonb_build_object('managerEditable', jsonb_build_object('before', to_jsonb(v_before), 'after', to_jsonb(v_tabs))));
end $$;

-- An Admin or higher changes a device's name and printer settings. Matches DeviceSettings.
create function public.save_device_settings(
  p_business uuid,
  p_device uuid,
  p_name text,
  p_settings jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.devices%rowtype;
begin
  if coalesce(private.member_rank(p_business), 0) < 2 then
    raise exception 'Only an Admin or Manager can change device settings.' using errcode = '42501';
  end if;
  perform private.assert_can_write(p_business);
  if coalesce(btrim(p_name), '') = '' or length(btrim(p_name)) > 60 then
    raise exception 'Give this device a name of up to 60 characters.';
  end if;
  if jsonb_typeof(p_settings) is distinct from 'object'
    or exists (select 1 from jsonb_object_keys(p_settings) k where k not in ('paperWidth', 'autoPrint', 'copies', 'autoLockMinutes'))
    or (p_settings -> 'paperWidth') is distinct from '58'::jsonb and (p_settings -> 'paperWidth') is distinct from '80'::jsonb
    or jsonb_typeof(p_settings -> 'autoPrint') is distinct from 'boolean'
    or not coalesce(p_settings -> 'copies' in ('1'::jsonb, '2'::jsonb, '3'::jsonb), false)
    or jsonb_typeof(p_settings -> 'autoLockMinutes') is distinct from 'number'
  then
    raise exception 'Check the device settings: paper 58 or 80 mm, 1 to 3 copies, lock after 0 to 120 minutes.';
  end if;
  -- Only reached once autoLockMinutes is known to be a number.
  if (p_settings ->> 'autoLockMinutes')::numeric not between 0 and 120
    or (p_settings ->> 'autoLockMinutes')::numeric <> trunc((p_settings ->> 'autoLockMinutes')::numeric)
  then
    raise exception 'Lock the till after a whole number of minutes from 0 to 120.';
  end if;

  select * into v_before from public.devices where id = p_device and business_id = p_business and not retired for update;
  if not found then raise exception 'This device is not registered with the business.'; end if;
  update public.devices set name = btrim(p_name), settings = p_settings where id = p_device;
  insert into public.audit_log (business_id, actor, action, table_name, record_id, before, after)
  values (p_business, auth.uid(), 'device.settings', 'devices', p_device::text,
    jsonb_build_object('name', v_before.name, 'settings', v_before.settings),
    jsonb_build_object('name', btrim(p_name), 'settings', p_settings));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Logos in Storage
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-assets', 'brand-assets', true, 524288, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Whether the caller may write a brand file at this path ("<business id>/<file>").
create function private.can_edit_brand_path(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_folder text := split_part(p_name, '/', 1);
begin
  if v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return private.can_edit_setting(v_folder::uuid, 'brand') and private.licence_allows_at(v_folder::uuid, now());
end $$;

create policy brand_assets_read on storage.objects for select to authenticated
  using (bucket_id = 'brand-assets');
create policy brand_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-assets' and private.can_edit_brand_path(name));
create policy brand_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'brand-assets' and private.can_edit_brand_path(name))
  with check (bucket_id = 'brand-assets' and private.can_edit_brand_path(name));
create policy brand_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brand-assets' and private.can_edit_brand_path(name));

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_platform_developer(),
  private.is_member(uuid),
  private.member_rank(uuid),
  private.can_read(uuid),
  private.can_edit_brand_path(text)
to authenticated;
grant execute on function
  public.licence_state_at(text, timestamptz, integer, timestamptz),
  public.business_licence(uuid),
  public.am_platform_developer(),
  public.console_businesses(),
  public.console_create_business(text, text, text, text, integer, boolean, uuid, text, text, text, text, text, text),
  public.console_update_licence(uuid, text, text, timestamptz, text),
  public.console_set_manager_editable(uuid, text[]),
  public.register_device(uuid, uuid, text),
  public.device_check_in(uuid, uuid),
  public.save_business_settings(uuid, integer, jsonb, text),
  public.save_device_settings(uuid, uuid, text, jsonb)
to authenticated;
grant execute on function public.console_user_id_by_email(text), public.licence_signing_key() to service_role;
