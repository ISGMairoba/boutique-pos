-- Phase 3: catalogue and stock.
--
-- * Ids are made on the device (uuid), so the same save can be retried, or queued while offline, without
--   creating duplicates.
-- * Products have up to three options; each combination is a variant with its own price, barcode and
--   stock. public.save_product() applies the rules of validateProduct() in
--   packages/domain/src/catalogue.ts; change both together.
-- * Stock only changes through stock_movements, written by record_stock() (and, from Phase 4, by
--   sales). variants.on_hand and batches.on_hand are kept in step in the same transaction. Stock may
--   go below zero: a sale is never refused for stock.
-- * Managers (rank 3+) edit the catalogue; Admins (rank 2+) receive, adjust and count stock.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------
create table public.categories (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  sort integer not null default 0,
  archived boolean not null default false,
  seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index categories_name on public.categories (business_id, lower(name)) where not archived;
create index categories_business on public.categories (business_id, seq);

create table public.products (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  category_id uuid references public.categories(id) on delete set null,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  archived boolean not null default false,
  version integer not null default 1 check (version > 0),
  seq bigint not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_business on public.products (business_id, seq);
create index products_category on public.products (category_id);

create table public.variants (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  option_values text[] not null default '{}',
  sku text check (sku ~ '^[A-Za-z0-9.-]{4,32}$'),
  barcode text check (barcode ~ '^[A-Za-z0-9.-]{4,32}$'),
  price bigint not null check (price between 0 and 1000000000000),
  cost bigint check (cost between 0 and 1000000000000),
  low_stock_at integer check (low_stock_at >= 0),
  on_hand integer not null default 0,
  archived boolean not null default false,
  seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index variants_barcode on public.variants (business_id, lower(barcode)) where barcode is not null and not archived;
create unique index variants_sku on public.variants (business_id, lower(sku)) where sku is not null and not archived;
create index variants_business on public.variants (business_id, seq);
create index variants_product on public.variants (product_id);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  variant_id uuid not null references public.variants(id) on delete cascade,
  batch_no text not null check (length(btrim(batch_no)) between 1 and 40),
  expires_on date,
  on_hand integer not null default 0,
  seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variant_id, batch_no)
);
create index batches_business on public.batches (business_id, seq);
create index batches_expiry on public.batches (business_id, expires_on) where on_hand > 0;

create table public.stock_movements (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  variant_id uuid not null references public.variants(id) on delete cascade,
  batch_id uuid references public.batches(id) on delete set null,
  reason text not null check (reason in ('receive', 'adjust', 'count', 'damage', 'return', 'sale')),
  qty integer not null check (qty <> 0 or reason = 'count'),
  on_hand_after integer not null,
  note text check (length(note) <= 200),
  ref_id uuid,
  actor uuid references auth.users(id) on delete set null,
  happened_at timestamptz not null,
  business_date date not null,
  recorded_at timestamptz not null default now(),
  seq bigint not null default 0
);
create index stock_movements_variant on public.stock_movements (variant_id, happened_at desc);
create index stock_movements_business on public.stock_movements (business_id, seq);
create index stock_movements_batch on public.stock_movements (batch_id);
create index stock_movements_actor on public.stock_movements (actor);

-- ---------------------------------------------------------------------------------------------
-- Triggers, RLS and grants
-- ---------------------------------------------------------------------------------------------
create trigger categories_seq before insert or update on public.categories for each row execute function private.next_seq();
create trigger products_seq before insert or update on public.products for each row execute function private.next_seq();
create trigger variants_seq before insert or update on public.variants for each row execute function private.next_seq();
create trigger batches_seq before insert or update on public.batches for each row execute function private.next_seq();
create trigger stock_movements_seq before insert or update on public.stock_movements for each row execute function private.next_seq();
create trigger categories_touch before update on public.categories for each row execute function private.touch_updated_at();
create trigger products_touch before update on public.products for each row execute function private.touch_updated_at();
create trigger variants_touch before update on public.variants for each row execute function private.touch_updated_at();
create trigger batches_touch before update on public.batches for each row execute function private.touch_updated_at();

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.variants enable row level security;
alter table public.batches enable row level security;
alter table public.stock_movements enable row level security;
revoke all on public.categories, public.products, public.variants, public.batches, public.stock_movements from anon, authenticated;
grant select on public.categories, public.products, public.variants, public.batches, public.stock_movements to authenticated;
create policy member_read on public.categories for select to authenticated using (private.can_read(business_id));
create policy member_read on public.products for select to authenticated using (private.can_read(business_id));
create policy member_read on public.variants for select to authenticated using (private.can_read(business_id));
create policy member_read on public.batches for select to authenticated using (private.can_read(business_id));
create policy member_read on public.stock_movements for select to authenticated using (private.can_read(business_id));

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------
create function private.require_rank(p_business uuid, p_rank integer, p_who text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(private.member_rank(p_business), 0) < p_rank then
    raise exception 'Only % can do this.', p_who using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------------------------
create function public.save_category(
  p_business uuid, p_id uuid, p_name text, p_sort integer default 0, p_archived boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  perform private.require_rank(p_business, 3, 'a Manager');
  perform private.assert_can_write(p_business);
  if coalesce(btrim(p_name), '') = '' or length(btrim(p_name)) > 60 then
    raise exception 'Give the category a name of 1 to 60 characters.';
  end if;
  select business_id into v_owner from public.categories where id = p_id;
  if found and v_owner <> p_business then raise exception 'That category belongs to another business.'; end if;
  begin
    insert into public.categories (id, business_id, name, sort, archived)
    values (p_id, p_business, btrim(p_name), coalesce(p_sort, 0), coalesce(p_archived, false))
    on conflict (id) do update set name = excluded.name, sort = excluded.sort, archived = excluded.archived;
  exception when unique_violation then
    raise exception 'There is already a category called %.', btrim(p_name);
  end;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Products and variants
-- ---------------------------------------------------------------------------------------------
-- p_product: { id, name, categoryId, options: [{ name, values: [] }], version (null when new) }
-- p_variants: [{ id, optionValues: [], sku, barcode, price, cost, lowStockAt }]
-- Variants of the product that are left out are archived (their stock history stays).
create function public.save_product(p_business uuid, p_product jsonb, p_variants jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_product ->> 'id')::uuid;
  v_name text := btrim(coalesce(p_product ->> 'name', ''));
  v_category uuid := nullif(p_product ->> 'categoryId', '')::uuid;
  v_options jsonb := coalesce(p_product -> 'options', '[]'::jsonb);
  v_existing public.products%rowtype;
  v_option jsonb;
  v_value jsonb;
  v_variant jsonb;
  v_values text[];
  v_index integer;
  v_seen text[];
  v_combos text[] := '{}';
  v_ids uuid[] := '{}';
  v_codes text[] := '{}';
  v_code text;
  v_field text;
  v_label text;
  v_limit integer;
  v_count integer;
  v_version integer;
  v_other uuid;
begin
  perform private.require_rank(p_business, 3, 'a Manager');
  perform private.assert_can_write(p_business);

  -- product
  if v_name = '' or length(v_name) > 120 then raise exception 'Give the product a name of 1 to 120 characters.'; end if;
  if jsonb_typeof(v_options) is distinct from 'array' then raise exception 'Options must be a list.'; end if;
  if jsonb_array_length(v_options) > 3 then raise exception 'Use at most 3 options.'; end if;
  v_seen := '{}';
  for v_option in select * from jsonb_array_elements(v_options) loop
    if jsonb_typeof(v_option -> 'name') is distinct from 'string'
      or btrim(v_option ->> 'name') = '' or length(btrim(v_option ->> 'name')) > 30 then
      raise exception 'Name each option (for example Size).';
    end if;
    if lower(btrim(v_option ->> 'name')) = any (v_seen) then
      raise exception 'There are two options called %.', btrim(v_option ->> 'name');
    end if;
    v_seen := v_seen || lower(btrim(v_option ->> 'name'));
    if jsonb_typeof(v_option -> 'values') is distinct from 'array' then
      raise exception 'Add at least one value for %.', btrim(v_option ->> 'name');
    end if;
    if jsonb_array_length(v_option -> 'values') not between 1 and 40 then
      raise exception 'Give % between 1 and 40 values.', btrim(v_option ->> 'name');
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_option -> 'values') v
      where jsonb_typeof(v) is distinct from 'string' or btrim(v #>> '{}') = '' or length(btrim(v #>> '{}')) > 40
    ) then
      raise exception 'Each value of % needs 1 to 40 characters.', btrim(v_option ->> 'name');
    end if;
    if (select count(distinct lower(btrim(v #>> '{}'))) from jsonb_array_elements(v_option -> 'values') v)
      <> jsonb_array_length(v_option -> 'values') then
      raise exception '% has a value listed twice.', btrim(v_option ->> 'name');
    end if;
  end loop;
  if v_category is not null and not exists (
    select 1 from public.categories where id = v_category and business_id = p_business
  ) then
    raise exception 'Choose a category from this business.';
  end if;

  select * into v_existing from public.products where id = v_id for update;
  if found then
    if v_existing.business_id <> p_business then raise exception 'That product belongs to another business.'; end if;
    if (p_product ->> 'version')::integer is distinct from v_existing.version then
      raise exception 'This product was changed on another device. Reload it and make your change again.'
        using errcode = 'BPVER';
    end if;
  else
    v_limit := private.plan_limit(p_business, 'products');
    select count(*) into v_count from public.products where business_id = p_business and not archived;
    if v_limit is not null and v_count >= v_limit then
      raise exception 'This plan allows % products. Archive some or ask your installer to upgrade the plan.', v_limit
        using errcode = 'BPLIM';
    end if;
  end if;

  -- variants
  if jsonb_typeof(p_variants) is distinct from 'array' or jsonb_array_length(p_variants) = 0 then
    raise exception 'Add at least one variant.';
  end if;
  if jsonb_array_length(p_variants) > 200 then raise exception 'Use at most 200 variants.'; end if;
  for v_variant in select * from jsonb_array_elements(p_variants) loop
    select coalesce(array_agg(btrim(v #>> '{}') order by o), '{}') into v_values
    from jsonb_array_elements(coalesce(v_variant -> 'optionValues', '[]'::jsonb)) with ordinality as t(v, o);
    v_label := coalesce(nullif(array_to_string(v_values, ' / '), ''), v_name);
    if cardinality(v_values) <> jsonb_array_length(v_options) then
      raise exception '% does not match the options. Remove it and add it again.', v_label;
    end if;
    v_index := 0;
    for v_option in select * from jsonb_array_elements(v_options) loop
      v_index := v_index + 1;
      if not exists (
        select 1 from jsonb_array_elements(v_option -> 'values') v
        where lower(btrim(v #>> '{}')) = lower(v_values[v_index])
      ) then
        raise exception '% uses %, which is not a value of %.', v_label, v_values[v_index], btrim(v_option ->> 'name');
      end if;
    end loop;
    if lower(array_to_string(v_values, E'\x1f')) = any (v_combos) then raise exception '% is listed twice.', v_label; end if;
    v_combos := v_combos || lower(array_to_string(v_values, E'\x1f'));

    if jsonb_typeof(v_variant -> 'price') is distinct from 'number'
      or (v_variant ->> 'price')::numeric <> trunc((v_variant ->> 'price')::numeric)
      or (v_variant ->> 'price')::numeric not between 0 and 1000000000000 then
      raise exception 'Enter a price for %.', v_label;
    end if;
    if coalesce(jsonb_typeof(v_variant -> 'cost'), 'null') not in ('null', 'number')
      or (jsonb_typeof(v_variant -> 'cost') = 'number' and (
        (v_variant ->> 'cost')::numeric <> trunc((v_variant ->> 'cost')::numeric)
        or (v_variant ->> 'cost')::numeric not between 0 and 1000000000000)) then
      raise exception 'The cost of % must be zero or more.', v_label;
    end if;
    if coalesce(jsonb_typeof(v_variant -> 'lowStockAt'), 'null') not in ('null', 'number')
      or (jsonb_typeof(v_variant -> 'lowStockAt') = 'number' and (
        (v_variant ->> 'lowStockAt')::numeric <> trunc((v_variant ->> 'lowStockAt')::numeric)
        or (v_variant ->> 'lowStockAt')::numeric < 0)) then
      raise exception 'The low-stock level of % must be a whole number.', v_label;
    end if;

    foreach v_field in array array['barcode', 'sku'] loop
      v_code := nullif(btrim(coalesce(v_variant ->> v_field, '')), '');
      if v_code is null then continue; end if;
      if v_code !~ '^[A-Za-z0-9.-]{4,32}$' then
        raise exception 'The % of % must be 4 to 32 letters, digits, dots or dashes.',
          case v_field when 'sku' then 'SKU' else v_field end, v_label;
      end if;
      if v_field || ':' || lower(v_code) = any (v_codes) then
        raise exception 'Two variants have the % %.', case v_field when 'sku' then 'SKU' else v_field end, v_code;
      end if;
      v_codes := v_codes || (v_field || ':' || lower(v_code));
      execute format(
        'select id from public.variants where business_id = $1 and lower(%I) = lower($2) and not archived and product_id <> $3 limit 1',
        v_field
      ) into v_other using p_business, v_code, v_id;
      if v_other is not null then
        raise exception 'The % % is already used by another item.', case v_field when 'sku' then 'SKU' else v_field end, v_code
          using errcode = 'BPDUP';
      end if;
    end loop;

    if exists (
      select 1 from public.variants where id = (v_variant ->> 'id')::uuid and (business_id <> p_business or product_id <> v_id)
    ) then
      raise exception 'A variant id is already used elsewhere. Reload the product and try again.';
    end if;
    v_ids := v_ids || (v_variant ->> 'id')::uuid;
  end loop;

  -- write
  v_version := coalesce(v_existing.version, 0) + 1;
  insert into public.products (id, business_id, name, category_id, options, version, created_by)
  values (v_id, p_business, v_name, v_category,
    (select coalesce(jsonb_agg(jsonb_build_object(
       'name', btrim(o ->> 'name'),
       'values', (select jsonb_agg(btrim(v #>> '{}') order by i) from jsonb_array_elements(o -> 'values') with ordinality as x(v, i))
     ) order by n), '[]'::jsonb) from jsonb_array_elements(v_options) with ordinality as t(o, n)),
    v_version, auth.uid())
  on conflict (id) do update set name = excluded.name, category_id = excluded.category_id,
    options = excluded.options, version = excluded.version, archived = false;

  -- Archive variants no longer offered first, so their codes are free for the new list.
  update public.variants set archived = true where product_id = v_id and not (id = any (v_ids)) and not archived;

  for v_variant in select * from jsonb_array_elements(p_variants) loop
    select coalesce(array_agg(btrim(v #>> '{}') order by o), '{}') into v_values
    from jsonb_array_elements(coalesce(v_variant -> 'optionValues', '[]'::jsonb)) with ordinality as t(v, o);
    insert into public.variants (id, business_id, product_id, option_values, sku, barcode, price, cost, low_stock_at)
    values (
      (v_variant ->> 'id')::uuid, p_business, v_id, v_values,
      nullif(btrim(coalesce(v_variant ->> 'sku', '')), ''),
      nullif(btrim(coalesce(v_variant ->> 'barcode', '')), ''),
      (v_variant ->> 'price')::bigint,
      (v_variant ->> 'cost')::bigint,
      (v_variant ->> 'lowStockAt')::integer
    )
    on conflict (id) do update set option_values = excluded.option_values, sku = excluded.sku,
      barcode = excluded.barcode, price = excluded.price, cost = excluded.cost,
      low_stock_at = excluded.low_stock_at, archived = false;
  end loop;

  insert into public.audit_log (business_id, actor, action, table_name, record_id, before, after)
  values (p_business, auth.uid(), case when v_existing.id is null then 'product.create' else 'product.update' end,
    'products', v_id::text,
    case when v_existing.id is null then null else jsonb_build_object('name', v_existing.name, 'version', v_existing.version) end,
    jsonb_build_object('name', v_name, 'version', v_version, 'variants', jsonb_array_length(p_variants)));
  return v_version;
end $$;

create function public.archive_product(p_business uuid, p_product uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_rank(p_business, 3, 'a Manager');
  perform private.assert_can_write(p_business);
  update public.products set archived = p_archived, version = version + 1
  where id = p_product and business_id = p_business;
  if not found then raise exception 'That product was not found.'; end if;
  if not p_archived then
    -- Bringing a product back must not reuse a barcode another item now has.
    if exists (
      select 1 from public.variants v join public.variants o
        on o.business_id = v.business_id and lower(o.barcode) = lower(v.barcode) and o.id <> v.id and not o.archived
      where v.product_id = p_product and v.barcode is not null
    ) then
      raise exception 'Another item now uses one of this product''s barcodes. Change the barcode first.';
    end if;
  end if;
  insert into public.audit_log (business_id, actor, action, table_name, record_id)
  values (p_business, auth.uid(), case when p_archived then 'product.archive' else 'product.restore' end, 'products', p_product::text);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------------------------
-- p_movements: [{ id, variantId, kind: receive|adjust|count|damage, quantity (receive/adjust/damage),
--                 counted (count), batch: { number, expiresOn } | null, note, happenedAt }]
-- All movements are applied together. A movement id seen before is skipped, so a retried save is safe.
-- Returns [{ id, variantId, onHand }] with each variant's stock after the save.
create function public.record_stock(p_business uuid, p_movements jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_move jsonb;
  v_kind text;
  v_variant public.variants%rowtype;
  v_batch public.batches%rowtype;
  v_qty integer;
  v_at timestamptz;
  v_zone text;
  v_number text;
  v_expires date;
  v_result jsonb := '[]'::jsonb;
begin
  perform private.require_rank(p_business, 2, 'an Admin or Manager');
  if jsonb_typeof(p_movements) is distinct from 'array' or jsonb_array_length(p_movements) = 0 then
    raise exception 'Enter at least one quantity.';
  end if;
  if jsonb_array_length(p_movements) > 500 then raise exception 'Save at most 500 lines at a time.'; end if;
  select time_zone into v_zone from public.businesses where id = p_business;

  for v_move in select * from jsonb_array_elements(p_movements) loop
    if exists (select 1 from public.stock_movements where id = (v_move ->> 'id')::uuid) then
      continue;
    end if;
    v_kind := v_move ->> 'kind';
    if v_kind is null or v_kind not in ('receive', 'adjust', 'count', 'damage') then
      raise exception 'Unknown stock change %.', coalesce(v_kind, '(none)');
    end if;
    v_at := least(coalesce((v_move ->> 'happenedAt')::timestamptz, now()), now());
    perform private.assert_can_write(p_business, v_at);

    select * into v_variant from public.variants
    where id = (v_move ->> 'variantId')::uuid and business_id = p_business for update;
    if not found then raise exception 'That item was not found in this business.'; end if;

    if v_kind = 'count' then
      if jsonb_typeof(v_move -> 'counted') is distinct from 'number'
        or (v_move ->> 'counted')::numeric <> trunc((v_move ->> 'counted')::numeric)
        or (v_move ->> 'counted')::numeric < 0 then
        raise exception 'Enter the counted quantity as a whole number of zero or more.';
      end if;
      v_qty := (v_move ->> 'counted')::integer - v_variant.on_hand;
    else
      if jsonb_typeof(v_move -> 'quantity') is distinct from 'number'
        or (v_move ->> 'quantity')::numeric <> trunc((v_move ->> 'quantity')::numeric) then
        raise exception 'Enter quantities as whole numbers.';
      end if;
      v_qty := (v_move ->> 'quantity')::integer;
      if v_kind in ('receive', 'damage') and v_qty <= 0 then
        raise exception 'Enter a quantity of one or more.';
      end if;
      if v_kind = 'adjust' and v_qty = 0 then raise exception 'Enter a change other than zero.'; end if;
      if v_kind = 'damage' then v_qty := -v_qty; end if;
    end if;

    v_batch := null;
    v_number := nullif(btrim(coalesce(v_move #>> '{batch,number}', '')), '');
    if v_number is not null then
      if length(v_number) > 40 then raise exception 'Use a batch number of up to 40 characters.'; end if;
      v_expires := nullif(v_move #>> '{batch,expiresOn}', '')::date;
      insert into public.batches (business_id, variant_id, batch_no, expires_on)
      values (p_business, v_variant.id, v_number, v_expires)
      on conflict (variant_id, batch_no) do update set expires_on = coalesce(public.batches.expires_on, excluded.expires_on)
      returning * into v_batch;
      update public.batches set on_hand = on_hand + v_qty where id = v_batch.id;
    end if;

    update public.variants set on_hand = on_hand + v_qty where id = v_variant.id returning * into v_variant;
    insert into public.stock_movements (
      id, business_id, variant_id, batch_id, reason, qty, on_hand_after, note, actor, happened_at, business_date
    ) values (
      (v_move ->> 'id')::uuid, p_business, v_variant.id, v_batch.id, v_kind, v_qty, v_variant.on_hand,
      nullif(left(btrim(coalesce(v_move ->> 'note', '')), 200), ''), auth.uid(), v_at, (v_at at time zone v_zone)::date
    );
    v_result := v_result || jsonb_build_object('id', v_move ->> 'id', 'variantId', v_variant.id, 'onHand', v_variant.on_hand);
  end loop;
  return v_result;
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
  public.save_device_settings(uuid, uuid, text, jsonb),
  public.save_category(uuid, uuid, text, integer, boolean),
  public.save_product(uuid, jsonb, jsonb),
  public.archive_product(uuid, uuid, boolean),
  public.record_stock(uuid, jsonb)
to authenticated;
grant execute on function public.console_user_id_by_email(text), public.licence_signing_key() to service_role;
