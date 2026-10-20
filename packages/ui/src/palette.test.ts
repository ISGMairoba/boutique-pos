import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  brandCssVariables,
  buildBrandPalette,
  contrastRatio,
  DARK_BACKGROUND,
  foregroundFor,
  hexToRgb,
  MIN_TEXT_CONTRAST,
  MIN_UI_CONTRAST,
  mix,
} from './palette.ts';

test('contrast ratio matches the WCAG reference values', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
});

test('hex parsing rejects shorthand and names', () => {
  assert.deepEqual(hexToRgb('#7A1F5C'), [122, 31, 92]);
  assert.throws(() => hexToRgb('#fff'), RangeError);
  assert.throws(() => hexToRgb('plum'), RangeError);
});

test('foreground is white on deep colours and dark on pale ones', () => {
  assert.equal(foregroundFor('#7a1f5c'), '#ffffff');
  assert.equal(foregroundFor('#f5c542'), '#14161f');
});

test('mix blends towards the second colour', () => {
  assert.equal(mix('#000000', '#ffffff', 0), '#000000');
  assert.equal(mix('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
});

test('sample brand colours give readable light and dark palettes', () => {
  for (const brand of ['#7a1f5c', '#0f6b5b', '#1f3fa8', '#8a4b12', '#f5c542']) {
    const palette = buildBrandPalette(brand);
    assert.ok(palette.contrast >= MIN_TEXT_CONTRAST, `${brand} text contrast`);
    assert.ok(contrastRatio(palette.dark.primary, DARK_BACKGROUND) >= MIN_UI_CONTRAST, `${brand} dark mode`);
    assert.ok(
      contrastRatio(palette.dark.primary, palette.dark.primaryForeground) >= MIN_TEXT_CONTRAST,
      `${brand} dark text`,
    );
  }
});

test('a mid-tone that neither white nor dark text can sit on is refused with a reason', () => {
  assert.throws(() => buildBrandPalette('#7b7b7b'), /hard to read/);
  assert.doesNotThrow(() => buildBrandPalette('#2bb3c0'));
});

test('css variables use the theme.css names', () => {
  const vars = brandCssVariables(buildBrandPalette('#1f3fa8').light);
  assert.deepEqual(Object.keys(vars), ['--primary', '--primary-foreground', '--primary-soft', '--ring']);
});
