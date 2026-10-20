import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatMoney, lineTotal, minorDigits, parseAmount, percentOf } from './money.ts';

test('minor digits follow the currency', () => {
  assert.equal(minorDigits('NGN'), 2);
  assert.equal(minorDigits('JPY'), 0);
});

test('parseAmount accepts typed amounts and returns minor units', () => {
  assert.equal(parseAmount('12,500'), 1250000);
  assert.equal(parseAmount('12500.5'), 1250050);
  assert.equal(parseAmount('₦1,200.00'), 120000);
  assert.equal(parseAmount(' 0.07 '), 7);
  assert.equal(parseAmount('-50'), -5000);
  assert.equal(parseAmount('300', 'JPY'), 300);
});

test('parseAmount rejects anything that is not a plain amount', () => {
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('1.234'), null);
  assert.equal(parseAmount('1.5', 'JPY'), null);
  assert.equal(parseAmount('1e5'), null);
});

test('formatMoney shows the currency with its decimals', () => {
  const ngn = formatMoney(1782000, { currency: 'NGN', locale: 'en-NG' });
  assert.match(ngn, /17,820\.00/);
  assert.match(formatMoney(0, { currency: 'USD', locale: 'en-US' }), /^\$0\.00$/);
});

test('lineTotal and percentOf stay whole', () => {
  assert.equal(lineTotal(280000, 2), 560000);
  assert.throws(() => lineTotal(100.5, 1), RangeError);
  assert.equal(percentOf(1810000, 5), 90500);
  assert.equal(percentOf(333, 50), 167);
});
