// Builds a client's theme from one brand colour. The developer picks the colour; this works out the
// text colour to put on it and a lighter version for dark mode, and refuses colours that cannot be
// made readable. Values follow WCAG 2.x relative luminance and contrast ratio.

export interface BrandTokens {
  /** Brand colour for buttons, active tabs and highlights. */
  primary: string;
  /** Text and icons placed on the brand colour. */
  primaryForeground: string;
  /** Faint brand tint for selected rows and soft backgrounds. */
  primarySoft: string;
  /** Focus ring. */
  ring: string;
}

export interface BrandPalette {
  light: BrandTokens;
  dark: BrandTokens;
  /** Contrast of the brand colour against its foreground in light mode. */
  contrast: number;
}

/** Page backgrounds the palette is checked against; keep in step with theme.css. */
export const LIGHT_BACKGROUND = '#ffffff';
export const DARK_BACKGROUND = '#111421';

const HEX = /^#([0-9a-f]{6})$/i;
type Rgb = [number, number, number];

export function isHexColour(value: string): boolean {
  return HEX.test(value);
}

export function hexToRgb(hex: string): Rgb {
  const match = HEX.exec(hex);
  if (!match?.[1]) throw new RangeError(`Use a colour like #7a1f5c, not "${hex}"`);
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mix two colours; amount 0 keeps a, 1 gives b. */
export function mix(a: string, b: string, amount: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(
    [0, 1, 2].map((i) => (ca[i] as number) + ((cb[i] as number) - (ca[i] as number)) * amount) as Rgb,
  );
}

const WHITE = '#ffffff';
const INK = '#14161f';

/** The more readable of white or near-black text on a colour. */
export function foregroundFor(background: string): string {
  return contrastRatio(background, WHITE) >= contrastRatio(background, INK) ? WHITE : INK;
}

/**
 * Lighten a colour step by step until it reaches the wanted contrast against a dark background,
 * so a deep brand colour still reads as a button in dark mode.
 */
function liftForDark(hex: string, minContrast: number): string {
  let colour = hex;
  for (let step = 0; step < 20 && contrastRatio(colour, DARK_BACKGROUND) < minContrast; step++) {
    colour = mix(colour, WHITE, 0.1);
  }
  return colour;
}

/** Minimum contrast between the brand colour and its text, the WCAG AA level for normal text. */
export const MIN_TEXT_CONTRAST = 4.5;
/** Minimum contrast between a brand-coloured control and the page, the WCAG level for UI parts. */
export const MIN_UI_CONTRAST = 3;

export function buildBrandPalette(brand: string): BrandPalette {
  const primary = rgbToHex(hexToRgb(brand));
  const primaryForeground = foregroundFor(primary);
  const contrast = contrastRatio(primary, primaryForeground);
  if (contrast < MIN_TEXT_CONTRAST) {
    throw new RangeError(
      `Text on ${primary} would be hard to read (contrast ${contrast.toFixed(1)}:1). Choose a darker or lighter colour.`,
    );
  }
  const darkPrimary = liftForDark(primary, MIN_UI_CONTRAST);
  return {
    contrast,
    light: {
      primary,
      primaryForeground,
      primarySoft: mix(primary, LIGHT_BACKGROUND, 0.88),
      ring: primary,
    },
    dark: {
      primary: darkPrimary,
      primaryForeground: foregroundFor(darkPrimary),
      primarySoft: mix(darkPrimary, DARK_BACKGROUND, 0.8),
      ring: darkPrimary,
    },
  };
}

/** CSS custom properties for a set of brand tokens, matching the names in theme.css. */
export function brandCssVariables(tokens: BrandTokens): Record<string, string> {
  return {
    '--primary': tokens.primary,
    '--primary-foreground': tokens.primaryForeground,
    '--primary-soft': tokens.primarySoft,
    '--ring': tokens.ring,
  };
}
