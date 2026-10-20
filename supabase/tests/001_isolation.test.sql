-- One business can never see another business's rows; cashiers cannot read manager-only tables;
-- nobody writes tables directly; anonymous visitors read nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager-a@test.local'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cashier-b@test.local'),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'platform@test.local'),
  ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'disabled-a@test.local');

insert into public.businesses (id, name, preset_key, receipt_prefix) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Shop A', 'fashion', 'SA'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Shop B', 'kids', 'SB');

insert into public.members (business_id, user_id, rank, username, display_name, disabled) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 3, 'ada', 'Ada', false),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 1, 'bayo', 'Bayo', false),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 2, 'dami', 'Dami', true);

insert into public.licences (business_id, plan_id, state, valid_until) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'starter', 'active', now() + interval '30 days'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'trial', 'trial', now() - interval '10 days');

insert into public.events (id, business_id, kind, payload, actor, client_created_at) values
  (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test.event', '{}', '11111111-1111-4111-8111-111111111111', now()),
  (gen_random_uuid(), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'test.event', '{}', '22222222-2222-4222-8222-222222222222', now());

insert into private.platform_developers (user_id) values ('33333333-3333-4333-8333-333333333333');

select ok((select seq from public.businesses where name = 'Shop A') > 0, 'synced rows get a seq number');

-- Manager of Shop A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
select results_eq('select name from public.businesses', $$values ('Shop A'::text)$$, 'a member sees only their own business');
select is((select count(*)::int from public.members), 2, 'a member sees only their own business''s staff');
select is((select count(*)::int from public.events), 1, 'a manager sees only their own business''s events');
select is((select state from public.business_licence('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 'active', 'a member reads their licence');
select is((select count(*)::int from public.business_licence('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')), 0, 'a member cannot read another business''s licence');
select throws_ok(
  $$insert into public.businesses (name, preset_key, receipt_prefix) values ('Mine', 'fashion', 'MI')$$,
  '42501', null, 'members cannot write tables directly'
);
select is((select count(*)::int from public.developer_actions), 0, 'members cannot read developer actions');

-- Cashier of Shop B: licence expired 10 days ago with 7 grace days
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
select is((select count(*)::int from public.events), 0, 'a cashier cannot read events');
select is(
  (select state || ':' || can_sell from public.business_licence('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),
  'read_only:false', 'an expired licence past grace is read-only'
);

-- Disabled member of Shop A
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);
select is((select count(*)::int from public.businesses), 0, 'a disabled member sees nothing');

-- Platform developer
select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}', true);
select is((select count(*)::int from public.businesses), 2, 'the platform developer sees every business');

-- Anonymous
reset role;
set local role anon;
select throws_ok('select 1 from public.businesses', '42501', null, 'anonymous visitors cannot read business tables');

select * from finish();
rollback;
