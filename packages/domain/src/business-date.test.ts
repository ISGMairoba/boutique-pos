import assert from 'node:assert/strict';
import { test } from 'node:test';
import { businessDate, endOfBusinessDay, isTimeZone, timeZoneOffsetMinutes } from './business-date.ts';

test('time zone offsets', () => {
  assert.equal(timeZoneOffsetMinutes(new Date('2026-10-21T12:00:00Z'), 'Africa/Lagos'), 60);
  assert.equal(timeZoneOffsetMinutes(new Date('2026-10-21T12:00:00Z'), 'UTC'), 0);
  assert.equal(timeZoneOffsetMinutes(new Date('2026-07-01T12:00:00Z'), 'America/New_York'), -240);
});

test('end of a business day is its last second in that zone', () => {
  assert.equal(endOfBusinessDay('2026-12-31', 'Africa/Lagos').toISOString(), '2026-12-31T22:59:59.000Z');
  assert.equal(endOfBusinessDay('2026-12-31', 'UTC').toISOString(), '2026-12-31T23:59:59.000Z');
  // New York leaves daylight saving on 2026-11-01.
  assert.equal(endOfBusinessDay('2026-11-01', 'America/New_York').toISOString(), '2026-11-02T04:59:59.000Z');
  assert.throws(() => endOfBusinessDay('31/12/2026', 'UTC'), RangeError);
});

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
