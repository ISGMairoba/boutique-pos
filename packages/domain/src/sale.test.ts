import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addToCart,
  buildSale,
  type CartLine,
  checkSale,
  discountLimitFor,
  emptySale,
  maxDiscount,
  normalisePhone,
  receiptNumber,
  type SaleDraft,
  type SaleRules,
  saleTotals,
  settle,
  shareDiscount,
} from './sale.ts';

const shirt: CartLine = {
  id: 'l1',
  variantId: 'v1',
  productId: 'p1',
  name: 'Linen shirt',
  optionValues: ['M', 'Sand'],
  sku: null,
  barcode: '2012345678905',
  unitPrice: 1_850_000,
  quantity: 1,
  discount: 0,
};
const tote: CartLine = { ...shirt, id: 'l2', variantId: 'v2', productId: 'p2', name: 'Canvas tote', optionValues: ['Black'], unitPrice: 450_000, quantity: 2 };

const rules: SaleRules = {
  channels: ['Walk-in', 'Instagram'],
  paymentMethods: ['Cash', 'POS', 'Transfer'],
  cashMethod: 'Cash',
  discountLimit: 10,
};

let n = 0;
const nextId = () => `new-${++n}`;

test('adding the same item again raises its quantity', () => {
  const { id: _id, quantity: _q, discount: _d, ...item } = shirt;
  let lines = addToCart([], item, nextId);
  lines = addToCart(lines, item, nextId);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.quantity, 2);
  lines = addToCart(lines, { ...item, variantId: 'v9' }, nextId);
  assert.equal(lines.length, 2);
});

test('a whole-sale discount is shared in whole units and adds up exactly', () => {
  assert.deepEqual(shareDiscount([100, 100, 100], 100), [34, 33, 33]);
  assert.deepEqual(shareDiscount([1, 2], 0), [0, 0]);
  assert.deepEqual(shareDiscount([0, 0], 50), [0, 0]);
  const shares = shareDiscount([1_850_000, 900_000], 275_000);
  assert.equal(
    shares.reduce((a, b) => a + b, 0),
    275_000,
  );
  assert.deepEqual(shares, [185_000, 90_000]);
  // Large amounts do not lose precision.
  const big = shareDiscount([9_000_000_000_000, 3], 7);
  assert.equal(
    big.reduce((a, b) => a + b, 0),
    7,
  );
});

test('totals include line and sale discounts, and line nets add up to the total', () => {
  const totals = saleTotals([{ ...shirt, discount: 50_000 }, tote], 100_000);
  assert.equal(totals.subtotal, 2_750_000);
  assert.equal(totals.lineDiscounts, 50_000);
  assert.equal(totals.discount, 150_000);
  assert.equal(totals.total, 2_600_000);
  assert.equal(totals.items, 3);
  assert.equal(
    totals.lines.reduce((sum, line) => sum + line.net, 0),
    totals.total,
  );
});

test('discount limits come from settings by rank; a Developer has none', () => {
  const selling = { discountLimits: { cashier: 0, admin: 10, manager: 25 } };
  assert.equal(discountLimitFor(selling, 1), 0);
  assert.equal(discountLimitFor(selling, 2), 10);
  assert.equal(discountLimitFor(selling, 3), 25);
  assert.equal(discountLimitFor(selling, 4), 100);
  assert.equal(discountLimitFor(selling, null), 0);
  assert.equal(maxDiscount(2_750_005, 10), 275_000);
});

test('split payments: change comes only from cash', () => {
  assert.deepEqual(
    settle(2_600_000, [
      { id: 'a', method: 'POS', amount: 2_000_000 },
      { id: 'b', method: 'Cash', amount: 1_000_000 },
    ], 'Cash'),
    { paid: 3_000_000, due: 0, change: 400_000, problems: [], complete: true },
  );
  const short = settle(2_600_000, [{ id: 'a', method: 'POS', amount: 2_000_000 }], 'Cash');
  assert.equal(short.due, 600_000);
  assert.equal(short.complete, false);
  const over = settle(1_000, [{ id: 'a', method: 'Transfer', amount: 1_500 }], 'Cash');
  assert.equal(over.complete, false);
  assert.match(over.problems[0] ?? '', /Only Cash/);
  assert.match(settle(1_000, [{ id: 'a', method: 'POS', amount: 1_500 }], null).problems[0] ?? '', /more than the total/);
  assert.equal(settle(0, [], 'Cash').complete, true);
  assert.equal(settle(1_000, [{ id: 'a', method: 'Cash', amount: 0 }], 'Cash').complete, false);
});

test('receipt numbers and phone numbers', () => {
  assert.equal(receiptNumber('LR', '02', 418), 'LR-02-000418');
  assert.equal(receiptNumber('KD', '01', 1_234_567), 'KD-01-1234567');
  assert.equal(normalisePhone(' 0803 123 4567 '), '08031234567');
  assert.equal(normalisePhone('+234 (803) 123-4567'), '+2348031234567');
  assert.equal(normalisePhone('12'), null);
  assert.equal(normalisePhone('call me'), null);
});

test('checkSale explains what stops a sale', () => {
  const draft: SaleDraft = { ...emptySale('Walk-in'), lines: [shirt, tote] };
  assert.deepEqual(checkSale(emptySale('Walk-in'), rules), ['Add at least one item.']);
  assert.deepEqual(checkSale(draft, rules), ['Take the rest of the payment.']);
  assert.deepEqual(checkSale({ ...draft, lines: [{ ...shirt, quantity: 0 }] }, rules), [
    'Enter a quantity from 1 to 9999 for Linen shirt.',
  ]);
  assert.deepEqual(checkSale({ ...draft, saleDiscount: 300_000 }, rules), [
    'You can give at most 10% off. Ask a Manager for more.',
  ]);
  assert.deepEqual(checkSale({ ...draft, saleDiscount: 1 }, { ...rules, discountLimit: 0 }), [
    'You cannot give discounts. Ask a Manager.',
  ]);
  const paid: SaleDraft = { ...draft, payments: [{ id: 'p', method: 'Cash', amount: 3_000_000 }] };
  assert.deepEqual(checkSale(paid, rules), []);
  assert.deepEqual(checkSale({ ...paid, channel: 'TikTok', customerPhone: '12' }, rules), [
    'Choose a sales channel.',
    'Enter the phone number with 7 to 15 digits, or leave it empty.',
  ]);
});

test('buildSale makes the record the till saves', () => {
  const draft: SaleDraft = {
    ...emptySale('Instagram'),
    lines: [shirt, tote],
    saleDiscount: 75_000,
    customerName: ' Mrs Okafor ',
    customerPhone: '0803 123 4567',
    payments: [{ id: 'p', method: 'Cash', amount: 3_000_000 }],
  };
  const sale = buildSale(
    draft,
    {
      id: 's1',
      number: 418,
      receiptPrefix: 'LR',
      deviceId: 'd1',
      deviceCode: '02',
      soldAt: new Date('2026-10-21T23:30:00Z'),
      timeZone: 'Africa/Lagos',
      cashierId: 'u1',
      cashierName: 'Amaka',
    },
    'Cash',
  );
  assert.equal(sale.receiptNo, 'LR-02-000418');
  assert.equal(sale.businessDate, '2026-10-22');
  assert.equal(sale.total, 2_675_000);
  assert.equal(sale.change, 325_000);
  assert.equal(sale.customerName, 'Mrs Okafor');
  assert.equal(sale.customerPhone, '08031234567');
  assert.equal(sale.note, null);
  assert.equal(
    sale.lines.reduce((sum, line) => sum + line.net, 0),
    sale.total,
  );
});
