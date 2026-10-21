-- Selling: apply_events accepts sales as facts, flags problems, refuses only what cannot be a sale.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email) values
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'platform@test.local'),
  ('55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local'),
  ('66666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cashier@test.local'),
  ('88888888-8888-4888-8888-888888888888', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@test.local');
insert into private.platform_developers (user_id) values ('33333333-3333-4333-8333-333333333333');
create temporary table ids (business uuid);
create temporary table t (name text primary key, value jsonb);
grant all on ids, t to authenticated;

-- Helpers for the tests below: one event, and the same sale with new ids and some fields changed.
create function pg_temp.event(p_sale jsonb) returns jsonb language sql as $$
  select jsonb_build_object('id', p_sale ->> 'id', 'kind', 'sale.completed', 'createdAt', now(), 'payload', p_sale);
$$;
create function pg_temp.variant(p_n integer, p_changes jsonb) returns jsonb language sql as $$
  select (select value from t where name = 'sale')
    || jsonb_build_object(
      'id', 'e6000000-0000-4000-8000-00000000000' || p_n, 'number', p_n, 'receiptNo', 'SB-01-00000' || p_n,
      'lines', (select jsonb_agg(l || jsonb_build_object('id', gen_random_uuid())) from jsonb_array_elements((select value from t where name = 'sale') -> 'lines') l),
      'payments', (select jsonb_agg(p || jsonb_build_object('id', gen_random_uuid())) from jsonb_array_elements((select value from t where name = 'sale') -> 'payments') p))
    || p_changes;
$$;
grant execute on function pg_temp.event(jsonb), pg_temp.variant(integer, jsonb) to authenticated;


set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333"}', true);
insert into ids select public.console_create_business('Shoes', 'shoes', 'SB', 'trial', 14, true, '55555555-5555-4555-8555-555555555555', 'ada', 'Ada');
reset role;
insert into public.members (business_id, user_id, rank, username, display_name) values
  ((select business from ids), '66666666-6666-4666-8666-666666666666', 1, 'bayo', 'Bayo');
set local role authenticated;

-- The owner sets up two items with stock in two batches, and a till.
select set_config('request.jwt.claims', '{"sub": "55555555-5555-4555-8555-555555555555"}', true);
select public.save_product((select business from ids),
  '{"id": "a6000000-0000-4000-8000-000000000001", "name": "Loafer", "categoryId": null, "options": [{"name": "Size", "values": ["40", "41"]}], "version": null}',
  '[{"id": "b6000000-0000-4000-8000-000000000001", "optionValues": ["40"], "price": 1000000, "cost": 400000, "lowStockAt": null},
    {"id": "b6000000-0000-4000-8000-000000000002", "optionValues": ["41"], "price": 500000, "cost": null, "lowStockAt": null}]');
select public.record_stock((select business from ids), '[
  {"id": "f6000000-0000-4000-8000-000000000001", "variantId": "b6000000-0000-4000-8000-000000000001", "kind": "receive", "quantity": 3, "batch": {"number": "LATE", "expiresOn": "2030-01-01"}},
  {"id": "f6000000-0000-4000-8000-000000000002", "variantId": "b6000000-0000-4000-8000-000000000001", "kind": "receive", "quantity": 2, "batch": {"number": "SOON", "expiresOn": "2029-01-01"}},
  {"id": "f6000000-0000-4000-8000-000000000003", "variantId": "b6000000-0000-4000-8000-000000000002", "kind": "receive", "quantity": 1}
]');
select public.register_device((select business from ids), 'd6000000-0000-4000-8000-000000000001', 'Till 1');

-- A sale as buildSale() makes it: 3 × size 40 and 2 × size 41 (one more than in stock), paid by POS and cash.
insert into t values ('sale', jsonb_build_object(
  'id', 'e6000000-0000-4000-8000-000000000001', 'number', 1, 'receiptNo', 'SB-01-000001',
  'deviceId', 'd6000000-0000-4000-8000-000000000001', 'deviceCode', '01', 'soldAt', now() - interval '5 minutes',
  'channel', 'Walk-in', 'customerName', 'Mrs Bello', 'customerPhone', '08031234567', 'note', null,
  'lines', '[{"id": "c6000000-0000-4000-8000-000000000001", "variantId": "b6000000-0000-4000-8000-000000000001", "productId": "a6000000-0000-4000-8000-000000000001", "name": "Loafer", "optionValues": ["40"], "unitPrice": 1000000, "quantity": 3, "discount": 0, "saleDiscountShare": 0, "net": 3000000},
             {"id": "c6000000-0000-4000-8000-000000000002", "variantId": "b6000000-0000-4000-8000-000000000002", "productId": "a6000000-0000-4000-8000-000000000001", "name": "Loafer", "optionValues": ["41"], "unitPrice": 500000, "quantity": 2, "discount": 0, "saleDiscountShare": 0, "net": 1000000}]'::jsonb,
  'subtotal', 4000000, 'saleDiscount', 0, 'discount', 0, 'total', 4000000,
  'payments', '[{"id": "c6100000-0000-4000-8000-000000000001", "method": "POS", "amount": 3000000}, {"id": "c6100000-0000-4000-8000-000000000002", "method": "Cash", "amount": 1500000}]'::jsonb,
  'paid', 4500000, 'change', 500000));

-- The cashier sells
select set_config('request.jwt.claims', '{"sub": "66666666-6666-4666-8666-666666666666"}', true);
select is(
  public.apply_events((select business from ids), jsonb_build_array(pg_temp.event((select value from t where name = 'sale')))) -> 0,
  '{"id": "e6000000-0000-4000-8000-000000000001", "status": "flagged", "flags": ["negative_stock"]}'::jsonb,
  'a sale that takes stock below zero is applied and flagged'
);
select is(
  (select on_hand from public.variants where id = 'b6000000-0000-4000-8000-000000000002'), -1,
  'stock may go below zero'
);
select is(
  (select array_agg(on_hand order by batch_no) from public.batches where variant_id = 'b6000000-0000-4000-8000-000000000001'),
  array[2, 0],
  'stock comes out of the batch that expires first'
);
select is(
  (select count(*)::integer from public.stock_movements where ref_id = 'e6000000-0000-4000-8000-000000000001' and reason = 'sale'), 3,
  'each batch and item taken gets a stock movement'
);
select results_eq(
  $$select total, paid, change_given, cashier_name, business_date = ((now() - interval '5 minutes') at time zone 'Africa/Lagos')::date from public.sales where id = 'e6000000-0000-4000-8000-000000000001'$$,
  $$values (4000000::bigint, 4500000::bigint, 500000::bigint, 'Bayo'::text, true)$$,
  'the server works out the totals and names the cashier'
);
select is(
  (select receipt_seq from public.devices where id = 'd6000000-0000-4000-8000-000000000001'), 1::bigint,
  'the device remembers its last receipt number'
);
select is(
  public.apply_events((select business from ids), jsonb_build_array(pg_temp.event((select value from t where name = 'sale')))) -> 0 ->> 'status',
  'duplicate',
  'sending the same sale again does not record it twice'
);

-- Problems are flagged, never refused
select is(
  public.apply_events((select business from ids), jsonb_build_array(pg_temp.event(pg_temp.variant(2, jsonb_build_object(
    'lines', '[{"id": "c6000000-0000-4000-8000-000000000021", "variantId": "b6000000-0000-4000-8000-000000000001", "productId": "a6000000-0000-4000-8000-000000000001", "name": "Loafer", "optionValues": ["40"], "unitPrice": 900000, "quantity": 1, "discount": 0, "saleDiscountShare": 50000, "net": 850000}]'::jsonb,
    'subtotal', 900000, 'saleDiscount', 50000, 'discount', 50000, 'total', 850000,
    'payments', '[{"id": "c6100000-0000-4000-8000-000000000021", "method": "Cash", "amount": 850000}]'::jsonb, 'paid', 850000, 'change', 0)))))
    -> 0 -> 'flags',
  '["discount_over_limit", "price_changed"]'::jsonb,
  'a discount over the cashier''s limit and a changed price are flagged'
);
select is(
  public.apply_events((select business from ids), jsonb_build_array(pg_temp.event(pg_temp.variant(3, jsonb_build_object(
    'receiptNo', 'SB-01-000001',
    'lines', '[{"id": "c6000000-0000-4000-8000-000000000031", "variantId": "b6000000-0000-4000-8000-000000000001", "productId": "a6000000-0000-4000-8000-000000000001", "name": "Loafer", "optionValues": ["40"], "unitPrice": 1000000, "quantity": 1, "discount": 0, "saleDiscountShare": 0, "net": 1000000}]'::jsonb,
    'subtotal', 1000000, 'total', 1000000,
    'payments', '[{"id": "c6100000-0000-4000-8000-000000000031", "method": "Transfer", "amount": 1200000}]'::jsonb, 'paid', 1200000, 'change', 200000)))))
    -> 0 -> 'flags',
  '["change_not_cash", "receipt_no_reused"]'::jsonb,
  'a reused receipt number and change on a transfer are flagged'
);
select is(
  (select receipt_no from public.sales where id = 'e6000000-0000-4000-8000-000000000003'), 'SB-01-000001-e600',
  'a reused receipt number is kept with a suffix'
);

-- What cannot be a sale is refused, without undoing the others in the same batch
select is(
  (select jsonb_agg(e ->> 'status') from jsonb_array_elements(public.apply_events((select business from ids), jsonb_build_array(
    pg_temp.event(pg_temp.variant(4, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'variantId', gen_random_uuid(), 'name', 'Ghost', 'unitPrice', 1, 'quantity', 1, 'discount', 0, 'saleDiscountShare', 0, 'net', 1))))),
    jsonb_build_object('id', 'e6000000-0000-4000-8000-000000000009', 'kind', 'stock.counted', 'payload', '{}'::jsonb),
    jsonb_build_object('id', 'not-an-id', 'kind', 'sale.completed'),
    pg_temp.event(pg_temp.variant(5, '{"deviceId": "junk"}'))
  ))) e),
  '["rejected", "rejected", "rejected", "flagged"]'::jsonb,
  'an unknown item, an unknown event kind and a bad id are refused; the rest still apply'
);
select is(
  (select count(*)::integer from public.events where business_id = (select business from ids)), 4,
  'only applied sales are recorded as events'
);

-- Only staff of the business can send sales
select set_config('request.jwt.claims', '{"sub": "88888888-8888-4888-8888-888888888888"}', true);
select throws_ok(
  $$select public.apply_events((select business from ids), '[]')$$, '42501', null,
  'someone who is not staff cannot send sales'
);

-- Disabled staff: what they sold before losing access is kept and flagged
reset role;
update public.members set disabled = true where user_id = '66666666-6666-4666-8666-666666666666';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "66666666-6666-4666-8666-666666666666"}', true);
select is(
  public.apply_events((select business from ids), jsonb_build_array(pg_temp.event(pg_temp.variant(6, '{}')))) -> 0 -> 'flags',
  '["negative_stock", "staff_disabled"]'::jsonb,
  'a queued sale from staff who were disabled is kept and flagged'
);
reset role;
update public.members set disabled = false where user_id = '66666666-6666-4666-8666-666666666666';
set local role authenticated;

-- Selling settings
select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333"}', true);
select throws_ok(
  $$select public.save_business_settings((select business from ids), (select version from public.business_settings where business_id = (select business from ids)),
    (select settings from public.business_settings where business_id = (select business from ids)) || '{"selling": {"cashMethod": "Cheque"}}', null)$$,
  'P0001', '"Cheque" is not one of the payment methods.',
  'the cash method must be one of the payment methods'
);
select throws_ok(
  $$select public.save_business_settings((select business from ids), (select version from public.business_settings where business_id = (select business from ids)),
    (select settings from public.business_settings where business_id = (select business from ids)) || '{"selling": {"discountLimits": {"cashier": 120}}}', null)$$,
  'P0001', 'Use a whole percentage from 0 to 100 for each discount limit.',
  'discount limits are whole percentages'
);
select lives_ok(
  $$select public.save_business_settings((select business from ids), (select version from public.business_settings where business_id = (select business from ids)),
    (select settings from public.business_settings where business_id = (select business from ids)) || '{"selling": {"cashMethod": "Cash", "discountLimits": {"cashier": 10, "admin": 20, "manager": 100}}}', null)$$,
  'valid selling settings save'
);

-- Suspension: a sale made before it is kept, one after is refused
select public.console_update_licence((select business from ids), 'suspend', 'Unpaid', null, null);
select set_config('request.jwt.claims', '{"sub": "66666666-6666-4666-8666-666666666666"}', true);
select is(
  public.apply_events((select business from ids), jsonb_build_array(pg_temp.event(pg_temp.variant(7, jsonb_build_object('soldAt', now() - interval '1 hour'))))) -> 0 ->> 'status',
  'flagged',
  'a sale made before the suspension is still accepted'
);
select is(
  public.apply_events((select business from ids), jsonb_build_array(pg_temp.event(pg_temp.variant(8, jsonb_build_object('soldAt', now() + interval '1 minute'))))) -> 0 ->> 'status',
  'rejected',
  'a sale made after the suspension is refused'
);

select * from finish();
rollback;
