import { brandCssVariables, buildBrandPalette } from '@boutique/ui/palette';

export type ThemeChoice = 'system' | 'light' | 'dark';

const THEME_KEY = 'boutique.theme';

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function resolve(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Applies the saved or system theme to <html> and follows system changes while on "system". */
export function initTheme(): void {
  const apply = () => {
    document.documentElement.dataset.theme = resolve(readChoice());
  };
  apply();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage can be unavailable (private windows); the choice then lasts for this visit only.
  }
  document.documentElement.dataset.theme = resolve(choice);
}

/**
 * Replaces the brand colours for the whole app from one brand colour. Light and dark values are
 * written to a single style element so switching theme needs no recalculation.
 */
export function applyBrand(brandColour: string): void {
  const palette = buildBrandPalette(brandColour);
  const block = (vars: Record<string, string>) =>
    Object.entries(vars)
      .map(([name, value]) => `${name}: ${value};`)
      .join(' ');
  let style = document.getElementById('brand-theme');
  if (!style) {
    style = document.createElement('style');
    style.id = 'brand-theme';
    document.head.append(style);
  }
  style.textContent = `:root { ${block(brandCssVariables(palette.light))} } [data-theme="dark"] { ${block(brandCssVariables(palette.dark))} }`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.light.primary);
}

/** Returns to the product's own colours, for screens outside a business such as the console. */
export function resetBrand(): void {
  document.getElementById('brand-theme')?.remove();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#3346d3');
}
