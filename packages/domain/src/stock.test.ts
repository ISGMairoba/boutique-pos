import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysUntil, expiryStatus, stockChange, stockStatus } from './stock.ts';

test('stock status', () => {
  assert.equal(stockStatus(0, 2), 'out');
  assert.equal(stockStatus(-1, null), 'out');
  assert.equal(stockStatus(2, 2), 'low');
  assert.equal(stockStatus(3, 2), 'ok');
  assert.equal(stockStatus(1, null), 'ok');
});

test('entered amounts become stock changes', () => {
  assert.equal(stockChange('receive', 12, 3), 12);
  assert.equal(stockChange('damage', 2, 3), -2);
  assert.equal(stockChange('adjust', -1, 3), -1);
  assert.equal(stockChange('count', 5, 8), -3);
  assert.equal(stockChange('count', 8, 8), 0);
  assert.throws(() => stockChange('receive', 0, 3), RangeError);
  assert.throws(() => stockChange('adjust', 0, 3), RangeError);
  assert.throws(() => stockChange('count', -1, 3), RangeError);
  assert.throws(() => stockChange('receive', 1.5, 3), RangeError);
});

test('expiry', () => {
  assert.equal(daysUntil('2026-10-21', '2026-12-20'), 60);
  assert.equal(expiryStatus('2026-10-21', '2026-10-20'), 'expired');
  assert.equal(expiryStatus('2026-10-21', '2026-12-20'), 'soon');
  assert.equal(expiryStatus('2026-10-21', '2026-12-21'), 'ok');
  assert.equal(expiryStatus('2026-10-21', null), 'ok');
});
