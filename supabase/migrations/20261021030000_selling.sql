-- Phase 4: selling.
--
-- * A sale is a fact. The till saves it on the device first and sends it later as a sale.completed
--   event to public.apply_events(). The server accepts it even with negative stock, a changed price
--   or a discount over the cashier's limit, and records why in sales.flags for a Manager to review.
--   An event is refused only when it cannot be a real sale (malformed, an item not in this business)
--   or when the licence did not allow selling at the time of the sale.
-- * Events are applied once: retrying an event already applied answers "duplicate".
-- * private.apply_sale() checks the arithmetic of checkSale()/buildSale() in
--   packages/domain/src/sale.ts; change both together.
-- * Settings gain "selling": which payment method is cash, and the discount limit for each rank
--   (validateSettings() in packages/domain/src/settings.ts).

-- ---------------------------------------------------------------------------------------------
-- Selling settings
-- ---------------------------------------------------------------------------------------------
create function private.check_selling_settings(p_selling jsonb, p_methods jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare
  v_key text;
  v_value jsonb;
begin
  if jsonb_typeof(p_selling) is distinct from 'object' then raise exception 'Selling settings must be a list of choices.'; end if;
  for v_key in select jsonb_object_keys(p_selling) loop
    if v_key not in ('cashMethod', 'discountLimits') then raise exception 'Unknown selling setting "%".', v_key; end if;
  end loop;
  v_value := p_selling -> 'cashMethod';
  if v_value is not null and jsonb_typeof(v_value) <> 'null' then
    if jsonb_typeof(v_value) <> 'string' or not exists (
      select 1 from jsonb_array_elements_text(coalesce(p_methods, '[]'::jsonb)) m where btrim(m) = btrim(v_value #>> '{}')
    ) then
      raise exception '"%" is not one of the payment methods.', v_value #>> '{}';
    end if;
  end if;
  if p_selling ? 'discountLimits' then
    if jsonb_typeof(p_selling -> 'discountLimits') is distinct from 'object' then
      raise exception 'Discount limits must be a percentage for each rank.';
    end if;
    for v_key, v_value in select * from jsonb_each(p_selling -> 'discountLimits') loop
      if v_key not in ('cashier', 'admin', 'manager') then raise exception 'Unknown rank "%" in discount limits.', v_key; end if;
      if jsonb_typeof(v_value) is distinct from 'number' or (v_value #>> '{}')::numeric <> trunc((v_value #>> '{}')::numeric)
        or (v_value #>> '{}')::numeric not between 0 and 100 then
        raise exception 'Use a whole percentage from 0 to 100 for each discount limit.';
      end if;
    end loop;
  end if;
end $$;

create or replace function private.check_business_settings(p_business uuid, p_settings jsonb) returns void
language plpgsql stable set search_path = '' as $$
declare
  v_key text;
  v_value jsonb;
  v_path text;
begin
  if jsonb_typeof(p_settings) is distinct from 'object' then raise exception 'Settings must be an object.'; end if;
  for v_key in select jsonb_object_keys(p_settings) loop
    if v_key not in ('brand', 'terminology', 'receipt', 'channels', 'paymentMethods', 'selling', 'features', 'catalogueSeed') then
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

  -- selling (optional: older settings have none and use the defaults)
  if p_settings ? 'selling' then
    perform private.check_selling_settings(p_settings -> 'selling', p_settings -> 'paymentMethods');
  end if;

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

create or replace function private.settings_tab_key(p_tab text) returns text
language sql immutable set search_path = '' as $$
  select case p_tab
    when 'brand' then 'brand'
    when 'terminology' then 'terminology'
    when 'receipt' then 'receipt'
    when 'channels' then 'channels'
    when 'payments' then 'paymentMethods'
    when 'selling' then 'selling'
  end;
$$;

-- The cash payment method, as parseSettings() reads it: the saved choice, or else the method called
-- "Cash" in any case.
create function private.cash_method(p_settings jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_settings -> 'selling' ? 'cashMethod' then (
      select m from jsonb_array_elements_text(coalesce(p_settings -> 'paymentMethods', '[]'::jsonb)) m
      where m = p_settings #>> '{selling,cashMethod}' limit 1)
    else (
      select m from jsonb_array_elements_text(coalesce(p_settings -> 'paymentMethods', '["Cash"]'::jsonb)) m
      where lower(btrim(m)) = 'cash' limit 1)
  end;
$$;

-- The biggest discount, in whole percent, a rank may give (discountLimitFor() in the domain package).
create function private.discount_limit(p_settings jsonb, p_rank integer) returns integer
language sql immutable set search_path = '' as $$
  select case
    when p_rank >= 4 then 100
    when p_rank = 3 then coalesce((p_settings #>> '{selling,discountLimits,manager}')::integer, 100)
    when p_rank = 2 then coalesce((p_settings #>> '{selling,discountLimits,admin}')::integer, 10)
    when p_rank = 1 then coalesce((p_settings #>> '{selling,discountLimits,cashier}')::integer, 0)
    else 0
  end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------
create table public.sales (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  number integer not null check (number > 0),
  receipt_no text not null check (length(receipt_no) between 1 and 40),
  cashier_id uuid references auth.users(id) on delete set null,
  cashier_name text not null check (length(cashier_name) <= 80),
  channel text not null check (length(btrim(channel)) between 1 and 30),
  customer_name text check (length(customer_name) between 1 and 80),
  customer_phone text check (customer_phone ~ '^\+?[0-9]{7,15}$'),
  note text check (length(note) between 1 and 200),
  subtotal bigint not null check (subtotal >= 0),
  sale_discount bigint not null check (sale_discount >= 0),
  discount bigint not null check (discount >= 0),
  total bigint not null,
  paid bigint not null check (paid >= 0),
  change_given bigint not null check (change_given >= 0),
  sold_at timestamptz not null,
  business_date date not null,
  -- Why a Manager should look at this sale, e.g. {negative_stock, price_changed}. Empty when fine.
  flags text[] not null default '{}',
  recorded_at timestamptz not null default now(),
  seq bigint not null default 0
);
create unique index sales_receipt_no on public.sales (business_id, receipt_no);
create index sales_business_date on public.sales (business_id, business_date);
create index sales_business on public.sales (business_id, seq);
create index sales_device on public.sales (device_id, number);
create index sales_cashier on public.sales (cashier_id);
create index sales_flagged on public.sales (business_id) where flags <> '{}';

create table public.sale_lines (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  line_no smallint not null check (line_no > 0),
  variant_id uuid not null references public.variants(id) on delete cascade,
  product_id uuid not null,
  name text not null check (length(name) between 1 and 120),
  option_values text[] not null default '{}',
  sku text,
  barcode text,
  unit_price bigint not null check (unit_price >= 0),
  -- The catalogue price and cost when the server received the sale, for price-change and profit reports.
  list_price bigint not null,
  cost bigint,
  quantity integer not null check (quantity between 1 and 9999),
  discount bigint not null check (discount >= 0),
  sale_discount_share bigint not null check (sale_discount_share >= 0),
  net bigint not null,
  seq bigint not null default 0,
  unique (sale_id, line_no)
);
create index sale_lines_business on public.sale_lines (business_id, seq);
create index sale_lines_variant on public.sale_lines (variant_id);

create table public.sale_payments (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  method text not null check (length(btrim(method)) between 1 and 30),
  amount bigint not null check (amount > 0),
  seq bigint not null default 0
);
create index sale_payments_sale on public.sale_payments (sale_id);
create index sale_payments_business on public.sale_payments (business_id, seq);

create index stock_movements_ref on public.stock_movements (ref_id) where ref_id is not null;

create trigger sales_seq before insert or update on public.sales for each row execute function private.next_seq();
create trigger sale_lines_seq before insert or update on public.sale_lines for each row execute function private.next_seq();
create trigger sale_payments_seq before insert or update on public.sale_payments for each row execute function private.next_seq();

alter table public.sales enable row level security;
alter table public.sale_lines enable row level security;
alter table public.sale_payments enable row level security;
revoke all on public.sales, public.sale_lines, public.sale_payments from anon, authenticated;
grant select on public.sales, public.sale_lines, public.sale_payments to authenticated;
create policy member_read on public.sales for select to authenticated using (private.can_read(business_id));
create policy member_read on public.sale_lines for select to authenticated using (private.can_read(business_id));
create policy member_read on public.sale_payments for select to authenticated using (private.can_read(business_id));

-- ---------------------------------------------------------------------------------------------
-- Applying a sale
-- ---------------------------------------------------------------------------------------------
-- Errors that mean "this can never be a sale" use errcode BPSAL so apply_events() refuses the event
-- instead of asking the device to try again.
create function private.sale_error(p_message text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  raise exception '%', p_message using errcode = 'BPSAL';
end $$;

create function private.whole(p_value jsonb, p_min bigint, p_max bigint) returns bigint
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_value) is distinct from 'number'
    or (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric)
    or (p_value #>> '{}')::numeric not between p_min and p_max then
    return null;
  end if;
  return (p_value #>> '{}')::bigint;
end $$;

-- Records one sale.completed event for the caller and returns its flags. p_sale is the SaleRecord
-- built by buildSale() in packages/domain/src/sale.ts.
create function private.apply_sale(p_business uuid, p_id uuid, p_sale jsonb) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  c_max constant bigint := 1000000000000000;
  v_member public.members%rowtype;
  v_settings jsonb;
  v_zone text;
  v_at timestamptz;
  v_sold timestamptz;
  v_number integer;
  v_receipt text;
  v_device uuid;
  v_flags text[] := '{}';
  v_line jsonb;
  v_line_no integer := 0;
  v_variant public.variants%rowtype;
  v_batch public.batches%rowtype;
  v_qty integer;
  v_left integer;
  v_take integer;
  v_unit bigint;
  v_disc bigint;
  v_share bigint;
  v_net bigint;
  v_subtotal bigint := 0;
  v_line_discounts bigint := 0;
  v_shares bigint := 0;
  v_nets bigint := 0;
  v_sale_discount bigint;
  v_total bigint;
  v_payment jsonb;
  v_amount bigint;
  v_paid bigint := 0;
  v_cash_paid bigint := 0;
  v_cash text;
  v_change bigint;
  v_date date;
  v_text text;
begin
  select * into v_member from public.members where business_id = p_business and user_id = auth.uid();
  if not found then raise exception 'Only staff of this business can record its sales.' using errcode = '42501'; end if;
  if v_member.disabled then v_flags := v_flags || 'staff_disabled'; end if;

  if jsonb_typeof(p_sale) is distinct from 'object' then perform private.sale_error('The sale is missing.'); end if;
  if p_sale ->> 'id' is distinct from p_id::text then perform private.sale_error('The sale does not match its event.'); end if;
  begin
    v_sold := (p_sale ->> 'soldAt')::timestamptz;
  exception when others then
    v_sold := null;
  end;
  if v_sold is null then perform private.sale_error('The sale has no time.'); end if;
  v_at := least(v_sold, now());
  perform private.assert_can_write(p_business, v_at);

  select s.settings, b.time_zone into v_settings, v_zone
  from public.business_settings s join public.businesses b on b.id = s.business_id
  where s.business_id = p_business;
  v_date := (v_at at time zone v_zone)::date;

  v_number := private.whole(p_sale -> 'number', 1, 2147483647);
  if v_number is null then perform private.sale_error('The sale has no receipt number.'); end if;
  v_receipt := btrim(coalesce(p_sale ->> 'receiptNo', ''));
  if v_receipt = '' or length(v_receipt) > 32 then perform private.sale_error('The sale has no receipt number.'); end if;
  if exists (select 1 from public.sales where business_id = p_business and receipt_no = v_receipt) then
    v_receipt := v_receipt || '-' || left(p_id::text, 4);
    v_flags := v_flags || 'receipt_no_reused';
  end if;

  v_text := btrim(coalesce(p_sale ->> 'channel', ''));
  if v_text = '' or length(v_text) > 30 then perform private.sale_error('The sale has no sales channel.'); end if;
  if not exists (select 1 from jsonb_array_elements_text(coalesce(v_settings -> 'channels', '[]'::jsonb)) c where c = v_text) then
    v_flags := v_flags || 'unknown_channel';
  end if;

  select id into v_device from public.devices where id = (p_sale ->> 'deviceId')::uuid and business_id = p_business;
  if found then
    update public.devices set receipt_seq = greatest(receipt_seq, v_number) where id = v_device;
  else
    v_flags := v_flags || 'unknown_device';
  end if;

  if jsonb_typeof(p_sale -> 'lines') is distinct from 'array' or jsonb_array_length(p_sale -> 'lines') not between 1 and 200 then
    perform private.sale_error('A sale needs 1 to 200 lines.');
  end if;
  if jsonb_typeof(p_sale -> 'payments') is distinct from 'array' or jsonb_array_length(p_sale -> 'payments') > 6 then
    perform private.sale_error('A sale can have at most 6 payments.');
  end if;
  v_sale_discount := private.whole(p_sale -> 'saleDiscount', 0, c_max);
  if v_sale_discount is null then perform private.sale_error('The discount must be a whole amount of zero or more.'); end if;

  insert into public.sales (
    id, business_id, device_id, number, receipt_no, cashier_id, cashier_name, channel,
    customer_name, customer_phone, note, subtotal, sale_discount, discount, total, paid, change_given,
    sold_at, business_date
  ) values (
    p_id, p_business, v_device, v_number, v_receipt, auth.uid(), left(v_member.display_name, 80), v_text,
    nullif(left(btrim(coalesce(p_sale ->> 'customerName', '')), 80), ''),
    case when coalesce(p_sale ->> 'customerPhone', '') ~ '^\+?[0-9]{7,15}$' then p_sale ->> 'customerPhone' end,
    nullif(left(btrim(coalesce(p_sale ->> 'note', '')), 200), ''),
    0, v_sale_discount, 0, 0, 0, 0, v_sold, v_date
  );

  for v_line in select * from jsonb_array_elements(p_sale -> 'lines') loop
    v_line_no := v_line_no + 1;
    v_qty := private.whole(v_line -> 'quantity', 1, 9999);
    v_unit := private.whole(v_line -> 'unitPrice', 0, c_max);
    v_disc := private.whole(v_line -> 'discount', 0, c_max);
    v_share := private.whole(v_line -> 'saleDiscountShare', 0, c_max);
    v_net := private.whole(v_line -> 'net', -c_max, c_max);
    if v_qty is null or v_unit is null or v_disc is null or v_share is null or v_net is null then
      perform private.sale_error('Line ' || v_line_no || ' has a quantity or amount that is not a whole number.');
    end if;
    begin
      select * into v_variant from public.variants
      where id = (v_line ->> 'variantId')::uuid and business_id = p_business for update;
    exception when invalid_text_representation then
      v_variant := null;
    end;
    if v_variant.id is null then perform private.sale_error('Line ' || v_line_no || ' is not an item in this business.'); end if;
    if v_variant.archived then v_flags := v_flags || 'archived_item'; end if;
    if v_unit <> v_variant.price then v_flags := v_flags || 'price_changed'; end if;
    if v_net <> v_unit * v_qty - v_disc - v_share then v_flags := v_flags || 'totals_mismatch'; end if;

    insert into public.sale_lines (
      id, business_id, sale_id, line_no, variant_id, product_id, name, option_values, sku, barcode,
      unit_price, list_price, cost, quantity, discount, sale_discount_share, net
    ) values (
      coalesce((v_line ->> 'id')::uuid, gen_random_uuid()), p_business, p_id, v_line_no, v_variant.id, v_variant.product_id,
      left(coalesce(nullif(btrim(v_line ->> 'name'), ''), 'Item'), 120),
      coalesce(array(select left(x, 40) from jsonb_array_elements_text(coalesce(v_line -> 'optionValues', '[]'::jsonb)) x), '{}'),
      v_variant.sku, v_variant.barcode, v_unit, v_variant.price, v_variant.cost, v_qty, v_disc, v_share, v_net
    );

    -- Take stock from the batches that expire first, then from stock without a batch.
    v_left := v_qty;
    for v_batch in
      select * from public.batches where variant_id = v_variant.id and on_hand > 0
      order by expires_on nulls last, created_at for update
    loop
      exit when v_left = 0;
      v_take := least(v_left, v_batch.on_hand);
      update public.batches set on_hand = on_hand - v_take where id = v_batch.id;
      update public.variants set on_hand = on_hand - v_take where id = v_variant.id returning * into v_variant;
      insert into public.stock_movements (id, business_id, variant_id, batch_id, reason, qty, on_hand_after, ref_id, actor, happened_at, business_date)
      values (gen_random_uuid(), p_business, v_variant.id, v_batch.id, 'sale', -v_take, v_variant.on_hand, p_id, auth.uid(), v_at, v_date);
      v_left := v_left - v_take;
    end loop;
    if v_left > 0 then
      update public.variants set on_hand = on_hand - v_left where id = v_variant.id returning * into v_variant;
      insert into public.stock_movements (id, business_id, variant_id, reason, qty, on_hand_after, ref_id, actor, happened_at, business_date)
      values (gen_random_uuid(), p_business, v_variant.id, 'sale', -v_left, v_variant.on_hand, p_id, auth.uid(), v_at, v_date);
    end if;
    if v_variant.on_hand < 0 then v_flags := v_flags || 'negative_stock'; end if;

    v_subtotal := v_subtotal + v_unit * v_qty;
    v_line_discounts := v_line_discounts + v_disc;
    v_shares := v_shares + v_share;
    v_nets := v_nets + v_net;
  end loop;
  v_total := v_subtotal - v_line_discounts - v_sale_discount;

  v_cash := private.cash_method(v_settings);
  for v_payment in select * from jsonb_array_elements(p_sale -> 'payments') loop
    v_amount := private.whole(v_payment -> 'amount', 1, c_max);
    v_text := btrim(coalesce(v_payment ->> 'method', ''));
    if v_amount is null or v_text = '' or length(v_text) > 30 then
      perform private.sale_error('Each payment needs a method and an amount above zero.');
    end if;
    if not exists (select 1 from jsonb_array_elements_text(coalesce(v_settings -> 'paymentMethods', '[]'::jsonb)) m where m = v_text) then
      v_flags := v_flags || 'unknown_payment_method';
    end if;
    insert into public.sale_payments (id, business_id, sale_id, method, amount)
    values (coalesce((v_payment ->> 'id')::uuid, gen_random_uuid()), p_business, p_id, v_text, v_amount);
    v_paid := v_paid + v_amount;
    if v_text = v_cash then v_cash_paid := v_cash_paid + v_amount; end if;
  end loop;

  v_change := greatest(0, v_paid - v_total);
  if v_paid < v_total then v_flags := v_flags || 'underpaid'; end if;
  if v_change > v_cash_paid then v_flags := v_flags || 'change_not_cash'; end if;
  if v_shares <> v_sale_discount or v_nets <> v_total
    or p_sale -> 'subtotal' is distinct from to_jsonb(v_subtotal)
    or p_sale -> 'total' is distinct from to_jsonb(v_total)
    or p_sale -> 'change' is distinct from to_jsonb(v_change) then
    v_flags := v_flags || 'totals_mismatch';
  end if;
  if (v_line_discounts + v_sale_discount) * 100 > v_subtotal * private.discount_limit(v_settings, v_member.rank) then
    v_flags := v_flags || 'discount_over_limit';
  end if;

  v_flags := array(select distinct f from unnest(v_flags) f order by f);
  update public.sales set
    subtotal = v_subtotal, discount = v_line_discounts + v_sale_discount, total = v_total,
    paid = v_paid, change_given = v_change, flags = v_flags
  where id = p_id;
  return v_flags;
end $$;

-- Applies events from a device's outbox, in order, each on its own: one refused event does not undo
-- the others. Answers, for each event: applied, flagged (applied, with reasons to review), duplicate
-- (applied before), rejected (will never apply; the device keeps it for a Manager to see) or error
-- (something went wrong on the server; the device tries again later).
create function public.apply_events(p_business uuid, p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_event jsonb;
  v_id uuid;
  v_kind text;
  v_flags text[];
  v_created timestamptz;
  v_result jsonb := '[]'::jsonb;
begin
  -- Disabled staff are let through so sales they made before losing access are kept (and flagged).
  if auth.uid() is null or not exists (
    select 1 from public.members where business_id = p_business and user_id = auth.uid()
  ) then
    raise exception 'Only staff of this business can send its sales.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_events) is distinct from 'array' then raise exception 'Send a list of events.'; end if;
  if jsonb_array_length(p_events) > 50 then raise exception 'Send at most 50 events at a time.'; end if;

  for v_event in select * from jsonb_array_elements(p_events) loop
    begin
      v_id := (v_event ->> 'id')::uuid;
    exception when others then
      v_id := null;
    end;
    if v_id is null then
      v_result := v_result || jsonb_build_object('id', v_event ->> 'id', 'status', 'rejected', 'reason', 'The event has no id.');
      continue;
    end if;
    if exists (select 1 from public.events where id = v_id) then
      v_result := v_result || jsonb_build_object('id', v_id, 'status', 'duplicate');
      continue;
    end if;
    v_kind := v_event ->> 'kind';
    begin
      if v_kind is distinct from 'sale.completed' then
        perform private.sale_error('This app version cannot apply "' || coalesce(v_kind, '') || '" events.');
      end if;
      begin
        v_created := (v_event ->> 'createdAt')::timestamptz;
      exception when others then
        v_created := null;
      end;
      v_flags := private.apply_sale(p_business, v_id, v_event -> 'payload');
      insert into public.events (id, business_id, kind, payload, device_id, actor, client_created_at, outcome, flag_reason)
      values (
        v_id, p_business, v_kind, v_event -> 'payload',
        (select device_id from public.sales where id = v_id), auth.uid(), coalesce(v_created, now()),
        case when v_flags = '{}' then 'applied' else 'flagged' end,
        nullif(array_to_string(v_flags, ', '), '')
      );
      v_result := v_result || jsonb_build_object(
        'id', v_id, 'status', case when v_flags = '{}' then 'applied' else 'flagged' end, 'flags', to_jsonb(v_flags));
    exception
      when sqlstate 'BPSAL' or sqlstate 'BPLIC' or sqlstate '42501' or sqlstate '22P02' or sqlstate '23514' then
        v_result := v_result || jsonb_build_object('id', v_id, 'status', 'rejected', 'reason', sqlerrm);
      when others then
        v_result := v_result || jsonb_build_object('id', v_id, 'status', 'error', 'reason', sqlerrm);
    end;
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
  public.record_stock(uuid, jsonb),
  public.apply_events(uuid, jsonb)
to authenticated;
grant execute on function public.console_user_id_by_email(text), public.licence_signing_key() to service_role;
