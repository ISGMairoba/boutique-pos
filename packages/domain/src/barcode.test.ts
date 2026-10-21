import assert from 'node:assert/strict';
import { test } from 'node:test';
import { code128Symbols, code128Widths, ean13CheckDigit, internalBarcode, isValidEan13 } from './barcode.ts';

test('EAN-13 check digits match the standard example', () => {
  assert.equal(ean13CheckDigit('400638133393'), 1);
  assert.equal(isValidEan13('4006381333931'), true);
  assert.equal(isValidEan13('4006381333932'), false);
  assert.equal(isValidEan13('400638133393'), false);
});

test('internal barcodes are valid in-store EAN-13 numbers', () => {
  const fixed = internalBarcode(() => '1234567890');
  assert.equal(fixed.slice(0, 12), '201234567890');
  assert.equal(isValidEan13(fixed), true);
  for (let i = 0; i < 20; i++) {
    const code = internalBarcode();
    assert.match(code, /^20\d{11}$/);
    assert.equal(isValidEan13(code), true);
  }
});

test('Code 128 uses set C for digits, with the right checksum', () => {
  // 105 + 12·1 + 34·2 + 56·3 + 78·4 = 665; 665 mod 103 = 47
  assert.deepEqual(code128Symbols('12345678'), [105, 12, 34, 56, 78, 47, 106]);
});

test('Code 128 uses set B for text', () => {
  // A=33, B=34, C=35; 104 + 33 + 68 + 105 = 310; 310 mod 103 = 1
  assert.deepEqual(code128Symbols('ABC'), [104, 33, 34, 35, 1, 106]);
});

test('Code 128 switches sets inside mixed codes', () => {
  const symbols = code128Symbols('SKU-123456');
  assert.equal(symbols[0], 104);
  assert.ok(symbols.includes(99), 'switches to set C for the digits');
  assert.deepEqual(symbols.slice(-5, -2), [12, 34, 56]);
  assert.throws(() => code128Symbols(''), RangeError);
  assert.throws(() => code128Symbols('café'), RangeError);
});

test('Code 128 widths have 11 modules per symbol and 13 for the stop', () => {
  const widths = code128Widths('2012345678905');
  const symbols = code128Symbols('2012345678905');
  assert.equal(
    widths.reduce((a, b) => a + b, 0),
    (symbols.length - 1) * 11 + 13,
  );
});
