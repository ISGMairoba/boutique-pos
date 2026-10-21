-- Phase 4 fixes found by the live checks of 20261021030000_selling:
-- * Flags are added with array_append(); "flags || 'text'" read the text as an array literal and
--   refused every flagged sale.
-- * Ids from a device are read with private.as_uuid(), so a malformed id is handled where it is read.
--   Any other unexpected error now answers "error" (the device tries again) instead of "rejected", so
--   a server fault can never turn away a real sale.

create function private.as_uuid(p_text text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p_text::uuid;
exception when invalid_text_representation then
  return null;
end $$;
revoke execute on function private.as_uuid(text) from public, anon, authenticated;

-- Records one sale.completed event for the caller and returns its flags. p_sale is the SaleRecord
-- built by buildSale() in packages/domain/src/sale.ts.
create or replace function private.apply_sale(p_business uuid, p_id uuid, p_sale jsonb) returns text[]
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
  if v_member.disabled then v_flags := array_append(v_flags, 'staff_disabled'); end if;

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
    v_flags := array_append(v_flags, 'receipt_no_reused');
  end if;

  v_text := btrim(coalesce(p_sale ->> 'channel', ''));
  if v_text = '' or length(v_text) > 30 then perform private.sale_error('The sale has no sales channel.'); end if;
  if not exists (select 1 from jsonb_array_elements_text(coalesce(v_settings -> 'channels', '[]'::jsonb)) c where c = v_text) then
    v_flags := array_append(v_flags, 'unknown_channel');
  end if;

  select id into v_device from public.devices where id = private.as_uuid(p_sale ->> 'deviceId') and business_id = p_business;
  if found then
    update public.devices set receipt_seq = greatest(receipt_seq, v_number) where id = v_device;
  else
    v_flags := array_append(v_flags, 'unknown_device');
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
    select * into v_variant from public.variants
    where id = private.as_uuid(v_line ->> 'variantId') and business_id = p_business for update;
    if v_variant.id is null then perform private.sale_error('Line ' || v_line_no || ' is not an item in this business.'); end if;
    if v_variant.archived then v_flags := array_append(v_flags, 'archived_item'); end if;
    if v_unit <> v_variant.price then v_flags := array_append(v_flags, 'price_changed'); end if;
    if v_net <> v_unit * v_qty - v_disc - v_share then v_flags := array_append(v_flags, 'totals_mismatch'); end if;

    insert into public.sale_lines (
      id, business_id, sale_id, line_no, variant_id, product_id, name, option_values, sku, barcode,
      unit_price, list_price, cost, quantity, discount, sale_discount_share, net
    ) values (
      coalesce(private.as_uuid(v_line ->> 'id'), gen_random_uuid()), p_business, p_id, v_line_no, v_variant.id, v_variant.product_id,
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
    if v_variant.on_hand < 0 then v_flags := array_append(v_flags, 'negative_stock'); end if;

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
      v_flags := array_append(v_flags, 'unknown_payment_method');
    end if;
    insert into public.sale_payments (id, business_id, sale_id, method, amount)
    values (coalesce(private.as_uuid(v_payment ->> 'id'), gen_random_uuid()), p_business, p_id, v_text, v_amount);
    v_paid := v_paid + v_amount;
    if v_text = v_cash then v_cash_paid := v_cash_paid + v_amount; end if;
  end loop;

  v_change := greatest(0, v_paid - v_total);
  if v_paid < v_total then v_flags := array_append(v_flags, 'underpaid'); end if;
  if v_change > v_cash_paid then v_flags := array_append(v_flags, 'change_not_cash'); end if;
  if v_shares <> v_sale_discount or v_nets <> v_total
    or p_sale -> 'subtotal' is distinct from to_jsonb(v_subtotal)
    or p_sale -> 'total' is distinct from to_jsonb(v_total)
    or p_sale -> 'change' is distinct from to_jsonb(v_change) then
    v_flags := array_append(v_flags, 'totals_mismatch');
  end if;
  if (v_line_discounts + v_sale_discount) * 100 > v_subtotal * private.discount_limit(v_settings, v_member.rank) then
    v_flags := array_append(v_flags, 'discount_over_limit');
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
create or replace function public.apply_events(p_business uuid, p_events jsonb) returns jsonb
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
    v_id := private.as_uuid(v_event ->> 'id');
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
      when sqlstate 'BPSAL' or sqlstate 'BPLIC' or sqlstate '42501' then
        v_result := v_result || jsonb_build_object('id', v_id, 'status', 'rejected', 'reason', sqlerrm);
      when others then
        v_result := v_result || jsonb_build_object('id', v_id, 'status', 'error', 'reason', sqlerrm);
    end;
  end loop;
  return v_result;
end $$;
