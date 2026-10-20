-- Business and device settings: tab permissions, versions, validation, logos and the licence gate.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email) values
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'platform@test.local'),
  ('55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local'),
  ('66666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cashier@test.local'),
  ('77777777-7777-4777-8777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local');
insert into private.platform_developers (user_id) values ('33333333-3333-4333-8333-333333333333');

create temporary table ids (business uuid, other uuid);
grant all on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333"}', true);
insert into ids values (
  public.console_create_business('Glow Bar', 'beauty', 'GB', 'trial', 14, true, '55555555-5555-4555-8555-555555555555', 'ada', 'Ada'),
  public.console_create_business('Other', 'fashion', 'OT', 'trial', 14, true, '55555555-5555-4555-8555-555555555555', 'ada', 'Ada')
);
reset role;
insert into public.members (business_id, user_id, rank, username, display_name) values
  ((select business from ids), '66666666-6666-4666-8666-666666666666', 1, 'bayo', 'Bayo'),
  ((select business from ids), '77777777-7777-4777-8777-777777777777', 2, 'chi', 'Chi');
insert into public.devices (id, business_id, code, name) values ('d0000000-0000-4000-8000-0000000000aa', (select business from ids), '01', 'Till');

create function pg_temp.settings() returns jsonb language sql as
  $$ select settings from public.business_settings where business_id = (select business from ids) $$;
create function pg_temp.version() returns integer language sql as
  $$ select version from public.business_settings where business_id = (select business from ids) $$;
grant execute on function pg_temp.settings(), pg_temp.version() to authenticated;

set local role authenticated;

-- Manager before any tab is allowed
select set_config('request.jwt.claims', '{"sub": "55555555-5555-4555-8555-555555555555"}', true);
select throws_ok(
  $$select public.save_business_settings((select business from ids), pg_temp.version(), jsonb_set(pg_temp.settings(), '{channels}', '["Walk-in","TikTok"]'))$$,
  '42501', null, 'a Manager cannot change a tab the developer has not allowed'
);
select is(private.can_edit_brand_path((select business from ids) || '/logo.png'), false, 'no logo upload without the brand tab');

-- Developer allows two tabs
select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333"}', true);
select lives_ok($$select public.console_set_manager_editable((select business from ids), array['channels', 'brand', 'channels'])$$, 'the developer chooses Manager tabs');
select is((select manager_editable from public.business_settings where business_id = (select business from ids)), array['brand', 'channels'], 'tabs are stored once each, sorted');
select throws_ok($$select public.console_set_manager_editable((select business from ids), array['everything'])$$, 'P0001', 'Unknown settings tab.', 'unknown tabs are refused');

-- Manager edits allowed tabs
select set_config('request.jwt.claims', '{"sub": "55555555-5555-4555-8555-555555555555"}', true);
select is(
  public.save_business_settings((select business from ids), 1, jsonb_set(pg_temp.settings(), '{channels}', '["Walk-in","TikTok"]')),
  2, 'saving an allowed tab moves to the next version'
);
select throws_ok(
  $$select public.save_business_settings((select business from ids), 1, pg_temp.settings())$$,
  'BPVER', null, 'a save from an older version is refused'
);
select throws_ok(
  $$select public.save_business_settings((select business from ids), pg_temp.version(), jsonb_set(pg_temp.settings(), '{channels}', '["Walk-in","walk-in "]'))$$,
  'P0001', '"walk-in" is listed twice.', 'lists cannot repeat an item'
);
select throws_ok(
  $$select public.save_business_settings((select business from ids), pg_temp.version(), jsonb_set(pg_temp.settings(), '{features,batches}', 'false'))$$,
  '42501', null, 'Managers cannot change features'
);
select throws_ok(
  $$select public.save_business_settings((select business from ids), pg_temp.version(),
    jsonb_set(pg_temp.settings(), '{brand,logo}', jsonb_build_object('screen', (select other from ids) || '/x.png', 'receipt', null)))$$,
  'P0001', 'Upload the logo again.', 'a logo must be stored under its own business'
);
select is(
  public.save_business_settings((select business from ids), pg_temp.version(), jsonb_set(pg_temp.settings(), '{brand,colour}', '"#7a1f5c"'), 'Glow Bar Lekki'),
  3, 'the brand tab covers colour and business name'
);
select is((select name from public.businesses where id = (select business from ids)), 'Glow Bar Lekki', 'the business is renamed');
select is(private.can_edit_brand_path((select other from ids) || '/logo.png'), false, 'no logo upload into another business');

-- Cashier and Admin
select set_config('request.jwt.claims', '{"sub": "66666666-6666-4666-8666-666666666666"}', true);
select throws_ok(
  $$select public.save_device_settings((select business from ids), 'd0000000-0000-4000-8000-0000000000aa', 'Till', '{"paperWidth":80,"autoPrint":true,"copies":1,"autoLockMinutes":10}')$$,
  '42501', null, 'a Cashier cannot change device settings'
);
select set_config('request.jwt.claims', '{"sub": "77777777-7777-4777-8777-777777777777"}', true);
select lives_ok(
  $$select public.save_device_settings((select business from ids), 'd0000000-0000-4000-8000-0000000000aa', 'Front till', '{"paperWidth":58,"autoPrint":false,"copies":2,"autoLockMinutes":5}')$$,
  'an Admin changes device settings'
);
select throws_ok(
  $$select public.save_device_settings((select business from ids), 'd0000000-0000-4000-8000-0000000000aa', 'Front till', '{"paperWidth":58,"autoPrint":false,"copies":1}')$$,
  'P0001', null, 'device settings must be complete'
);

select * from finish();
rollback;
