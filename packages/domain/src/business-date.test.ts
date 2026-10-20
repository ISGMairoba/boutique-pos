import assert from 'node:assert/strict';
import { test } from 'node:test';
import { businessDate, isTimeZone } from './business-date.ts';

test('business date follows the business time zone', () => {
  const lateEvening = new Date('2026-10-20T23:30:00Z');
  assert.equal(businessDate(lateEvening, 'Africa/Lagos'), '2026-10-21');
  assert.equal(businessDate(lateEvening, 'UTC'), '2026-10-20');
  assert.equal(businessDate(lateEvening, 'America/New_York'), '2026-10-20');
});

test('isTimeZone recognises real zones only', () => {
  assert.equal(isTimeZone('Africa/Lagos'), true);
  assert.equal(isTimeZone('Mars/Olympus'), false);
});
