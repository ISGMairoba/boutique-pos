import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Licence, licenceStateAt, licenceStatus, offlineCheckInValid } from './licence.ts';

const validUntil = new Date('2026-11-01T00:00:00Z');
const active: Licence = { state: 'active', validUntil, graceDays: 7 };
const at = (iso: string) => new Date(iso);

test('active until the expiry moment, then grace, then read-only', () => {
  assert.equal(licenceStateAt(active, at('2026-10-31T12:00:00Z')), 'active');
  assert.equal(licenceStateAt(active, validUntil), 'active');
  assert.equal(licenceStateAt(active, at('2026-11-04T00:00:00Z')), 'grace');
  assert.equal(licenceStateAt(active, at('2026-11-08T00:00:00Z')), 'grace');
  assert.equal(licenceStateAt(active, at('2026-11-08T00:00:01Z')), 'read_only');
});

test('trial behaves like active and also falls into grace', () => {
  const trial: Licence = { ...active, state: 'trial' };
  assert.equal(licenceStateAt(trial, at('2026-10-15T00:00:00Z')), 'trial');
  assert.equal(licenceStateAt(trial, at('2026-11-02T00:00:00Z')), 'grace');
});

test('suspended and read-only ignore the dates', () => {
  assert.equal(licenceStateAt({ ...active, state: 'suspended' }, at('2026-10-01T00:00:00Z')), 'suspended');
  assert.equal(licenceStateAt({ ...active, state: 'read_only' }, at('2026-10-01T00:00:00Z')), 'read_only');
});

test('status says what the business may do', () => {
  const grace = licenceStatus(active, at('2026-11-03T00:00:00Z'));
  assert.deepEqual([grace.state, grace.canSell, grace.canEdit, grace.canSignIn], ['grace', true, true, true]);
  assert.equal(grace.daysLeft, 5);

  const readOnly = licenceStatus(active, at('2026-12-01T00:00:00Z'));
  assert.deepEqual(
    [readOnly.canSell, readOnly.canEdit, readOnly.canSignIn, readOnly.daysLeft],
    [false, false, true, 0],
  );

  const suspended = licenceStatus({ ...active, state: 'suspended' }, at('2026-10-01T00:00:00Z'));
  assert.deepEqual([suspended.canSell, suspended.canSignIn], [false, false]);
});

test('days left counts down to expiry while active', () => {
  assert.equal(licenceStatus(active, at('2026-10-21T00:00:00Z')).daysLeft, 11);
});

test('a device must check in within the offline limit', () => {
  const lastCheckIn = at('2026-10-20T08:00:00Z');
  assert.equal(offlineCheckInValid(lastCheckIn, at('2026-10-27T08:00:00Z'), 7), true);
  assert.equal(offlineCheckInValid(lastCheckIn, at('2026-10-27T08:00:01Z'), 7), false);
});
