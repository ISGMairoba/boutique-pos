import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  combinations,
  type ProductDraft,
  priceRange,
  suggestedCategories,
  suggestedOptions,
  syncVariants,
  type VariantDraft,
  validateProduct,
  variantLabel,
} from './catalogue.ts';

const template = { sku: '', barcode: '', price: 1_250_000, cost: null, lowStockAt: 2 };
let counter = 0;
const newId = () => `v${++counter}`;

function draft(): ProductDraft {
  const options = [
    { name: 'Size', values: ['3-4Y', '5-6Y'] },
    { name: 'Colour', values: ['Blue', 'Pink'] },
  ];
  return {
    id: 'p1',
    name: 'Denim dungaree',
    categoryId: null,
    options,
    variants: syncVariants(options, [], template, newId),
  };
}

test('combinations multiply option values in order', () => {
  assert.deepEqual(combinations([]), [[]]);
  assert.deepEqual(
    combinations([
      { name: 'Size', values: ['S', 'M'] },
      { name: 'Colour', values: ['Red'] },
    ]),
    [
      ['S', 'Red'],
      ['M', 'Red'],
    ],
  );
});

test('variant labels show the options', () => {
  assert.equal(variantLabel('Denim dungaree', ['3-4Y', 'Blue']), 'Denim dungaree — 3-4Y / Blue');
  assert.equal(variantLabel('Gift card', []), 'Gift card');
});

test('syncing keeps existing variants and adds new combinations', () => {
  const product = draft();
  const first = product.variants[0] as VariantDraft;
  first.price = 999;
  first.barcode = '2012345678905';
  const grown = [...product.options];
  grown[0] = { name: 'Size', values: ['3-4Y', '5-6Y', '7-8Y'] };
  const synced = syncVariants(grown, product.variants, template, newId);
  assert.equal(synced.length, 6);
  assert.equal(synced[0]?.id, first.id);
  assert.equal(synced[0]?.price, 999);
  assert.equal(synced[0]?.barcode, '2012345678905');
  assert.equal(synced[4]?.price, template.price);

  const shrunk = syncVariants(
    [{ name: 'Size', values: ['3-4Y'] }, grown[1] ?? { name: '', values: [] }],
    synced,
    template,
    newId,
  );
  assert.deepEqual(
    shrunk.map((v) => v.id),
    [synced[0]?.id, synced[1]?.id],
  );
});

test('a well-formed product passes', () => {
  assert.deepEqual(validateProduct(draft()), []);
  const single: ProductDraft = {
    id: 'p2',
    name: 'Gift wrap',
    categoryId: null,
    options: [],
    variants: syncVariants([], [], template, newId),
  };
  assert.deepEqual(validateProduct(single), []);
});

test('validation explains every problem', () => {
  const product = draft();
  product.name = ' ';
  product.options.push({ name: 'size', values: ['A', 'a', ''] });
  const [a, b] = product.variants as [VariantDraft, VariantDraft];
  a.price = -1;
  a.cost = 1.5;
  a.barcode = 'abc';
  b.sku = 'SKU-1';
  (product.variants[2] as VariantDraft).sku = 'sku-1';
  (product.variants[3] as VariantDraft).optionValues = ['3-4Y', 'Green'];
  const paths = validateProduct(product).map((p) => p.path);
  for (const expected of [
    'name',
    'options.2.name',
    'options.2.values',
    'variants.0',
    'variants.0.price',
    'variants.0.cost',
    'variants.0.barcode',
    'variants.2.sku',
    'variants.3',
  ]) {
    assert.ok(paths.includes(expected), `expected ${expected} in ${paths.join(', ')}`);
  }
});

test('price range and preset suggestions', () => {
  assert.deepEqual(priceRange([500, 200, 900]), { min: 200, max: 900 });
  assert.equal(priceRange([]), null);
  const seed = {
    categories: ['Dresses', 4],
    optionSets: [{ name: 'Size', values: ['S', 'M'] }, { name: 'Colour', values: [] }, { values: ['x'] }],
  };
  assert.deepEqual(suggestedCategories(seed), ['Dresses']);
  assert.deepEqual(suggestedOptions(seed), [
    { name: 'Size', values: ['S', 'M'] },
    { name: 'Colour', values: [] },
  ]);
  assert.deepEqual(suggestedOptions(null), []);
});
