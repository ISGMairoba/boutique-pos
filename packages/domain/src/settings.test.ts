import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  changedKeys,
  cleanSettings,
  defaultSettings,
  editableTabs,
  parseDeviceSettings,
  parseSettings,
  receiptLineWidth,
  term,
  validateSettings,
} from './settings.ts';

const BUSINESS = '54efaac5-e8f7-46ea-acc2-b693a144c942';

// What console_create_business stores for a kids store.
const created = {
  brand: { colour: '#0F6B5B', logo: null },
  terminology: { product: 'Item', products: 'Items' },
  receipt: { header: [], footer: 'Exchanges within 7 days with this receipt' },
  channels: ['Walk-in', 'Instagram', 'WhatsApp'],
  paymentMethods: ['Cash', 'POS', 'Transfer'],
  features: { variants: true, exchanges: true, batches: false, giftReceipts: true },
  catalogueSeed: { categories: ['Babywear'], optionSets: [] },
};

test('stored settings from a new business parse with defaults filled in', () => {
  const settings = parseSettings(created);
  assert.equal(settings.brand.colour, '#0f6b5b');
  assert.equal(settings.receipt.showLogo, true);
  assert.equal(settings.receipt.footer, 'Exchanges within 7 days with this receipt');
  assert.deepEqual(settings.channels, ['Walk-in', 'Instagram', 'WhatsApp']);
  assert.deepEqual(settings.catalogueSeed, created.catalogueSeed);
  assert.deepEqual(validateSettings(settings, BUSINESS), []);
});

test('malformed stored values fall back instead of breaking', () => {
  const settings = parseSettings({
    brand: { colour: 'red', logo: 'x' },
    terminology: { product: 5, nonsense: 'Thing', customer: '  Client ' },
    receipt: { header: ['Lekki', 3], showLogo: 'yes' },
    channels: [],
    features: { variants: 'on', exchanges: false },
  });
  assert.equal(settings.brand.colour, '#3346d3');
  assert.equal(settings.brand.logo, null);
  assert.deepEqual(settings.terminology, { customer: 'Client' });
  assert.deepEqual(settings.receipt.header, ['Lekki']);
  assert.equal(settings.receipt.showLogo, true);
  assert.deepEqual(settings.channels, ['Walk-in']);
  assert.deepEqual(settings.features, { exchanges: false });
  assert.deepEqual(parseSettings(null), defaultSettings());
});

test('terms fall back to the default word', () => {
  const settings = parseSettings(created);
  assert.equal(term(settings, 'products'), 'Items');
  assert.equal(term(settings, 'customers'), 'Customers');
});

test('validation explains every problem', () => {
  const settings = parseSettings(created);
  settings.brand.colour = '#12345';
  settings.brand.logo = { screen: 'other-business/logo.png', receipt: null };
  settings.terminology.product = ' ';
  (settings.terminology as Record<string, string>).widget = 'Gadget';
  settings.receipt.header = Array.from({ length: 7 }, () => 'x'.repeat(49));
  settings.receipt.footer = 'a\nb\nc\nd\ne\nf\ng';
  settings.channels = ['Walk-in', 'walk-in ', ''];
  settings.paymentMethods = [];
  const paths = validateSettings(settings, BUSINESS).map((problem) => problem.path);
  for (const expected of [
    'brand.colour',
    'brand.logo.screen',
    'terminology.product',
    'terminology.widget',
    'receipt.header',
    'receipt.header.0',
    'receipt.footer',
    'channels.1',
    'channels.2',
    'paymentMethods',
  ]) {
    assert.ok(paths.includes(expected), `expected a problem at ${expected}; got ${paths.join(', ')}`);
  }
});

test('cleaning trims text, drops blank lines and default words', () => {
  const settings = parseSettings(created);
  settings.terminology.product = ' Product ';
  settings.terminology.customer = ' Client ';
  settings.receipt.header = [' 12 Admiralty Way ', '', 'Lekki'];
  settings.channels = [' Walk-in', '', 'TikTok '];
  const cleaned = cleanSettings(settings);
  assert.deepEqual(cleaned.terminology, { products: 'Items', customer: 'Client' });
  assert.deepEqual(cleaned.receipt.header, ['12 Admiralty Way', 'Lekki']);
  assert.deepEqual(cleaned.channels, ['Walk-in', 'TikTok']);
});

test('changed keys name what an edit touched', () => {
  const before = parseSettings(created);
  const after = parseSettings(created);
  after.channels = [...after.channels, 'TikTok'];
  after.brand.colour = '#7a1f5c';
  assert.deepEqual(changedKeys(before, after).sort(), ['brand', 'channels']);
  assert.deepEqual(changedKeys(before, parseSettings(created)), []);
});

test('who may edit which tab', () => {
  assert.deepEqual([...editableTabs(3, false, ['brand', 'receipt'])].sort(), ['brand', 'receipt']);
  assert.equal(editableTabs(3, false, []).size, 0);
  assert.equal(editableTabs(2, false, ['brand']).size, 0);
  assert.ok(editableTabs(null, true, []).has('features'));
  assert.ok(editableTabs(4, false, []).has('payments'));
});

test('device settings parse with safe defaults', () => {
  assert.deepEqual(parseDeviceSettings({}), {
    paperWidth: 80,
    autoPrint: true,
    copies: 1,
    autoLockMinutes: 10,
  });
  assert.deepEqual(parseDeviceSettings({ paperWidth: 58, copies: 9, autoLockMinutes: 0, autoPrint: false }), {
    paperWidth: 58,
    autoPrint: false,
    copies: 1,
    autoLockMinutes: 0,
  });
  assert.equal(receiptLineWidth(58), 32);
  assert.equal(receiptLineWidth(80), 48);
});
