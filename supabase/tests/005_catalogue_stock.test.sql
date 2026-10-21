-- Catalogue and stock: product rules, barcode uniqueness, permissions and stock movements.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, instance_id, aud, role, email) values
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'platform@test.local'),
  ('55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local'),
  ('77777777-7777-4777-8777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local'),
  ('66666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cashier@test.local');
insert into private.platform_developers (user_id) values ('33333333-3333-4333-8333-333333333333');
create temporary table ids (business uuid);
grant all on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333"}', true);
insert into ids select public.console_create_business('Kids', 'kids', 'KD', 'trial', 14, true, '55555555-5555-4555-8555-555555555555', 'ada', 'Ada');
reset role;
insert into public.members (business_id, user_id, rank, username, display_name) values
  ((select business from ids), '77777777-7777-4777-8777-777777777777', 2, 'chi', 'Chi'),
  ((select business from ids), '66666666-6666-4666-8666-666666666666', 1, 'bayo', 'Bayo');
set local role authenticated;

-- Manager builds the catalogue
select set_config('request.jwt.claims', '{"sub": "55555555-5555-4555-8555-555555555555"}', true);
select lives_ok($$select public.save_category((select business from ids), 'c1000000-0000-4000-8000-000000000001', 'Girls')$$, 'a Manager adds a category');
select throws_ok($$select public.save_category((select business from ids), gen_random_uuid(), ' girls ')$$, 'P0001', 'There is already a category called girls.', 'category names are unique');
select is(
  public.save_product((select business from ids),
    '{"id": "a1000000-0000-4000-8000-000000000001", "name": "Denim dungaree", "categoryId": "c1000000-0000-4000-8000-000000000001",
      "options": [{"name": "Size", "values": ["3-4Y", "5-6Y"]}], "version": null}',
    '[{"id": "b1000000-0000-4000-8000-000000000001", "optionValues": ["3-4Y"], "barcode": "2012345678905", "price": 1250000, "cost": 600000, "lowStockAt": 2},
      {"id": "b1000000-0000-4000-8000-000000000002", "optionValues": ["5-6Y"], "price": 1350000, "cost": null, "lowStockAt": null}]'),
  1, 'a new product is version 1'
);
select throws_ok(
  $$select public.save_product((select business from ids), '{"id": "a1000000-0000-4000-8000-000000000001", "name": "X", "options": [], "version": 7}', '[]')$$,
  'BPVER', null, 'a save from an older version is refused'
);
select throws_ok(
  $$select public.save_product((select business from ids), '{"id": "a1000000-0000-4000-8000-000000000001", "name": "Denim dungaree", "options": [{"name": "Size", "values": ["3-4Y"]}], "version": 1}',
    '[{"id": "b1000000-0000-4000-8000-000000000001", "optionValues": ["7-8Y"], "price": 1}]')$$,
  'P0001', '7-8Y uses 7-8Y, which is not a value of Size.', 'variants must use the product''s option values'
);
select throws_ok(
  $$select public.save_product((select business from ids), '{"id": "a2000000-0000-4000-8000-000000000001", "name": "Other", "options": [], "version": null}',
    '[{"id": "b2000000-0000-4000-8000-000000000001", "optionValues": [], "barcode": "2012345678905", "price": 100}]')$$,
  'BPDUP', null, 'a barcode belongs to one item'
);
select is(
  public.save_product((select business from ids),
    '{"id": "a1000000-0000-4000-8000-000000000001", "name": "Denim dungaree", "options": [{"name": "Size", "values": ["3-4Y", "7-8Y"]}], "version": 1}',
    '[{"id": "b1000000-0000-4000-8000-000000000001", "optionValues": ["3-4Y"], "barcode": "2012345678905", "price": 1300000},
      {"id": "b1000000-0000-4000-8000-000000000003", "optionValues": ["7-8Y"], "price": 1400000}]'),
  2, 'editing a product moves to the next version'
);
select is(
  (select count(*)::integer from public.variants where product_id = 'a1000000-0000-4000-8000-000000000001' and archived),
  1, 'a variant left out is archived, not deleted'
);

-- Cashier and Admin
select set_config('request.jwt.claims', '{"sub": "66666666-6666-4666-8666-666666666666"}', true);
select throws_ok(
  $$select public.record_stock((select business from ids), '[{"id": "e0000000-0000-4000-8000-000000000009", "variantId": "b1000000-0000-4000-8000-000000000001", "kind": "receive", "quantity": 5}]')$$,
  '42501', null, 'a Cashier cannot receive stock'
);
select set_config('request.jwt.claims', '{"sub": "77777777-7777-4777-8777-777777777777"}', true);
select throws_ok(
  $$select public.save_product((select business from ids), '{"id": "a3000000-0000-4000-8000-000000000001", "name": "Y", "options": [], "version": null}', '[]')$$,
  '42501', null, 'an Admin cannot edit the catalogue'
);
select lives_ok(
  $$select public.record_stock((select business from ids), '[
    {"id": "e1000000-0000-4000-8000-000000000001", "variantId": "b1000000-0000-4000-8000-000000000001", "kind": "receive", "quantity": 10,
     "batch": {"number": "B2410", "expiresOn": "2027-03-31"}},
    {"id": "e1000000-0000-4000-8000-000000000002", "variantId": "b1000000-0000-4000-8000-000000000003", "kind": "receive", "quantity": 4}]')$$,
  'an Admin receives stock for several items at once'
);
select is(
  public.record_stock((select business from ids), '[{"id": "e1000000-0000-4000-8000-000000000001", "variantId": "b1000000-0000-4000-8000-000000000001", "kind": "receive", "quantity": 10}]'),
  '[]'::jsonb, 'a retried movement is not applied twice'
);
select lives_ok(
  $$select public.record_stock((select business from ids), '[
    {"id": "e1000000-0000-4000-8000-000000000003", "variantId": "b1000000-0000-4000-8000-000000000001", "kind": "damage", "quantity": 1},
    {"id": "e1000000-0000-4000-8000-000000000004", "variantId": "b1000000-0000-4000-8000-000000000003", "kind": "count", "counted": 3},
    {"id": "e1000000-0000-4000-8000-000000000005", "variantId": "b1000000-0000-4000-8000-000000000003", "kind": "adjust", "quantity": -5}]')$$,
  'damage, count and adjustments are recorded'
);
select is(
  (select array_agg(on_hand order by id) from public.variants where id in ('b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000003')),
  array[9, -2], 'stock follows the movements and may go below zero'
);
select is(
  (select batch_no || ' ' || expires_on from public.batches where variant_id = 'b1000000-0000-4000-8000-000000000001'),
  'B2410 2027-03-31', 'receiving with a batch records its expiry date'
);

select * from finish();
rollback;
