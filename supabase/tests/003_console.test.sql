-- Developer console, licence enforcement and device registration.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email) values
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'platform@test.local'),
  ('55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local');
insert into private.platform_developers (user_id) values ('33333333-3333-4333-8333-333333333333');

create temporary table ids (business uuid);
grant all on ids to authenticated;

set local role authenticated;

-- Owner: not a developer
select set_config('request.jwt.claims', '{"sub": "55555555-5555-4555-8555-555555555555"}', true);
select is(public.am_platform_developer(), false, 'a business owner is not the platform developer');
select throws_ok(
  $$select public.console_create_business('X', 'kids', 'XX', 'trial', 14, true, '55555555-5555-4555-8555-555555555555', 'xx', 'X')$$,
  '42501', null, 'only the platform developer creates businesses'
);
select throws_ok('select * from public.console_businesses()', '42501', null, 'only the platform developer lists all businesses');

-- Developer creates a kids store on a 14-day trial
select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333"}', true);
select is(public.am_platform_developer(), true, 'the platform developer is recognised');
insert into ids select public.console_create_business(
  'Little Sprouts', 'kids', 'ls', 'trial', 14, true, '55555555-5555-4555-8555-555555555555', 'Amaka', 'Amaka Obi', '#0F6B5B'
);
select is(
  (select receipt_prefix || ' ' || state || ' ' || owner_username || ' ' || members from public.console_businesses()),
  'LS trial amaka 1', 'the new business has its owner, prefix and trial licence'
);
select is(
  (select settings -> 'terminology' ->> 'product' from public.business_settings where business_id = (select business from ids)),
  'Item', 'settings start from the preset'
);
select is(
  (select rank from public.members where business_id = (select business from ids)), 3::smallint,
  'the owner is a Manager'
);

-- Owner registers devices up to the trial plan's limit of 2
select set_config('request.jwt.claims', '{"sub": "55555555-5555-4555-8555-555555555555"}', true);
select is(public.register_device((select business from ids), 'd0000000-0000-4000-8000-000000000001', 'Front till'), '01', 'first device gets code 01');
select is(public.register_device((select business from ids), 'd0000000-0000-4000-8000-000000000002', 'Owner phone'), '02', 'second device gets code 02');
select is(public.register_device((select business from ids), 'd0000000-0000-4000-8000-000000000001', 'Front till'), '01', 'registering again returns the same code');
select throws_ok(
  $$select public.register_device((select business from ids), 'd0000000-0000-4000-8000-000000000003', 'Spare')$$,
  'BPLIM', null, 'the plan device limit applies'
);
select is(
  (select state from public.device_check_in((select business from ids), 'd0000000-0000-4000-8000-000000000001')),
  'trial', 'check-in returns the licence state'
);

-- Developer suspends
select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333"}', true);
select throws_ok(
  $$select public.console_update_licence((select business from ids), 'suspend', '  ')$$,
  'P0001', 'Give a reason. The business owner sees it.', 'suspending needs a reason'
);
select lives_ok(
  $$select public.console_update_licence((select business from ids), 'suspend', 'Unpaid invoice')$$,
  'the developer suspends a business'
);

-- Suspended: devices still learn their state, but nothing new is recorded
select set_config('request.jwt.claims', '{"sub": "55555555-5555-4555-8555-555555555555"}', true);
select is(
  (select state from public.device_check_in((select business from ids), 'd0000000-0000-4000-8000-000000000002')),
  'suspended', 'a suspended business''s devices learn they are suspended'
);
select throws_ok(
  $$select public.register_device((select business from ids), 'd0000000-0000-4000-8000-000000000004', 'New')$$,
  'BPLIC', null, 'a suspended business cannot add devices'
);

-- Work stamped before the suspension is still accepted
reset role;
select is(private.licence_allows_at((select business from ids), now() - interval '1 hour'), true, 'work from before the suspension is accepted');
update public.licences set state_changed_at = now() - interval '1 minute' where business_id = (select business from ids);
select is(private.licence_allows_at((select business from ids), now()), false, 'work after the suspension is refused');

-- Every console change is recorded
select is(
  (select string_agg(action, ',' order by id) from public.developer_actions where business_id = (select business from ids)),
  'business.create,licence.suspend', 'console changes are written to developer actions'
);

select * from finish();
rollback;
