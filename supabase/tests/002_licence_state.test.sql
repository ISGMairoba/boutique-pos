-- public.licence_state_at must match licenceStateAt() in packages/domain/src/licence.ts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is(public.licence_state_at('active', '2026-11-01T00:00Z', 7, '2026-10-31T12:00Z'), 'active', 'active before expiry');
select is(public.licence_state_at('active', '2026-11-01T00:00Z', 7, '2026-11-01T00:00Z'), 'active', 'active at the expiry moment');
select is(public.licence_state_at('active', '2026-11-01T00:00Z', 7, '2026-11-04T00:00Z'), 'grace', 'grace after expiry');
select is(public.licence_state_at('active', '2026-11-01T00:00Z', 7, '2026-11-08T00:00Z'), 'grace', 'grace until the last moment');
select is(public.licence_state_at('active', '2026-11-01T00:00Z', 7, '2026-11-08T00:00:01Z'), 'read_only', 'read-only after grace');
select is(public.licence_state_at('trial', '2026-11-01T00:00Z', 7, '2026-11-02T00:00Z'), 'grace', 'trials get grace too');
select is(public.licence_state_at('suspended', '2027-01-01T00:00Z', 7, '2026-10-01T00:00Z'), 'suspended', 'suspended ignores dates');
select is(public.licence_state_at('read_only', '2027-01-01T00:00Z', 7, '2026-10-01T00:00Z'), 'read_only', 'read-only ignores dates');

select * from finish();
rollback;
