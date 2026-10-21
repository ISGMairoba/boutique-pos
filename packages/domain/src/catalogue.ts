// Products and their variants. A product has up to three options (Size, Colour, Shade…); every
// combination of option values is a variant with its own price, barcode and stock.
// public.save_product() applies the same rules as validateProduct(); change both together.

import type { Minor } from './money.ts';

export const CATALOGUE_LIMITS = {
  nameLength: 120,
  options: 3,
  optionNameLength: 30,
  optionValues: 40,
  optionValueLength: 40,
  variants: 200,
  maxPrice: 1_000_000_000_000,
} as const;

export interface ProductOption {
  name: string;
  values: string[];
}

export interface VariantDraft {
  id: string;
  /** One value per product option, in the product's option order. Empty for a product without options. */
  optionValues: string[];
  sku: string;
  barcode: string;
  price: Minor;
  /** What the shop pays; null when not recorded. */
  cost: Minor | null;
  /** Warn when stock falls to this level or below; null for no warning. */
  lowStockAt: number | null;
}

export interface ProductDraft {
  id: string;
  name: string;
  categoryId: string | null;
  options: ProductOption[];
  variants: VariantDraft[];
}

export interface CatalogueProblem {
  path: string;
  message: string;
}

/** Every combination of option values, in order; one empty combination when there are no options. */
export function combinations(options: ProductOption[]): string[][] {
  return options.reduce<string[][]>(
    (rows, option) => rows.flatMap((row) => option.values.map((value) => [...row, value])),
    [[]],
  );
}

/** "Linen shirt — M / Sand"; just the product name when it has no options. */
export function variantLabel(productName: string, optionValues: string[]): string {
  return optionValues.length ? `${productName} — ${optionValues.join(' / ')}` : productName;
}

const comboKey = (values: string[]) => values.map((value) => value.trim().toLowerCase()).join('\u0000');

/**
 * The variants for the product's current options: keeps each existing variant whose combination is
 * still offered (so its id, price and barcode survive), and adds new ones from the template.
 */
export function syncVariants(
  options: ProductOption[],
  existing: VariantDraft[],
  template: Omit<VariantDraft, 'id' | 'optionValues'>,
  newId: () => string,
): VariantDraft[] {
  const byCombo = new Map(existing.map((variant) => [comboKey(variant.optionValues), variant]));
  return combinations(options).map((values) => {
    const found = byCombo.get(comboKey(values));
    return found ? { ...found, optionValues: values } : { ...template, id: newId(), optionValues: values };
  });
}

/** Barcodes and SKUs: 4 to 32 letters, digits, dots and dashes, as scanners send them. */
export const CODE_PATTERN = /^[A-Za-z0-9.-]{4,32}$/;

export function validateProduct(draft: ProductDraft): CatalogueProblem[] {
  const problems: CatalogueProblem[] = [];
  const name = draft.name.trim();
  if (!name || name.length > CATALOGUE_LIMITS.nameLength) {
    problems.push({
      path: 'name',
      message: `Give the product a name of 1 to ${CATALOGUE_LIMITS.nameLength} characters.`,
    });
  }

  if (draft.options.length > CATALOGUE_LIMITS.options) {
    problems.push({ path: 'options', message: `Use at most ${CATALOGUE_LIMITS.options} options.` });
  }
  const optionNames = new Set<string>();
  draft.options.forEach((option, index) => {
    const optionName = option.name.trim();
    if (!optionName || optionName.length > CATALOGUE_LIMITS.optionNameLength) {
      problems.push({
        path: `options.${index}.name`,
        message: `Name option ${index + 1} (for example Size).`,
      });
    } else if (optionNames.has(optionName.toLowerCase())) {
      problems.push({
        path: `options.${index}.name`,
        message: `There are two options called ${optionName}.`,
      });
    }
    optionNames.add(optionName.toLowerCase());
    if (option.values.length === 0) {
      problems.push({
        path: `options.${index}.values`,
        message: `Add at least one value for ${optionName || 'this option'}.`,
      });
    }
    if (option.values.length > CATALOGUE_LIMITS.optionValues) {
      problems.push({
        path: `options.${index}.values`,
        message: `Use at most ${CATALOGUE_LIMITS.optionValues} values.`,
      });
    }
    const seen = new Set<string>();
    for (const value of option.values) {
      const trimmed = value.trim();
      if (!trimmed || trimmed.length > CATALOGUE_LIMITS.optionValueLength) {
        problems.push({
          path: `options.${index}.values`,
          message: `Each value needs 1 to ${CATALOGUE_LIMITS.optionValueLength} characters.`,
        });
      } else if (seen.has(trimmed.toLowerCase())) {
        problems.push({ path: `options.${index}.values`, message: `${trimmed} is listed twice.` });
      }
      seen.add(trimmed.toLowerCase());
    }
  });

  if (draft.variants.length === 0) problems.push({ path: 'variants', message: 'Add at least one variant.' });
  if (draft.variants.length > CATALOGUE_LIMITS.variants) {
    problems.push({ path: 'variants', message: `Use at most ${CATALOGUE_LIMITS.variants} variants.` });
  }

  const combos = new Set<string>();
  const codes = new Map<string, string>();
  draft.variants.forEach((variant, index) => {
    const path = `variants.${index}`;
    const label = variant.optionValues.join(' / ') || 'This product';
    if (variant.optionValues.length !== draft.options.length) {
      problems.push({ path, message: `${label} does not match the options. Remove it and add it again.` });
    } else {
      variant.optionValues.forEach((value, i) => {
        const allowed = draft.options[i]?.values.map((v) => v.trim().toLowerCase()) ?? [];
        if (!allowed.includes(value.trim().toLowerCase())) {
          problems.push({
            path,
            message: `${label} uses ${value}, which is not a value of ${draft.options[i]?.name}.`,
          });
        }
      });
    }
    const key = comboKey(variant.optionValues);
    if (combos.has(key)) problems.push({ path, message: `${label} is listed twice.` });
    combos.add(key);

    if (
      !Number.isSafeInteger(variant.price) ||
      variant.price < 0 ||
      variant.price > CATALOGUE_LIMITS.maxPrice
    ) {
      problems.push({ path: `${path}.price`, message: `Enter a price for ${label}.` });
    }
    if (
      variant.cost !== null &&
      (!Number.isSafeInteger(variant.cost) || variant.cost < 0 || variant.cost > CATALOGUE_LIMITS.maxPrice)
    ) {
      problems.push({ path: `${path}.cost`, message: `The cost of ${label} must be zero or more.` });
    }
    if (variant.lowStockAt !== null && (!Number.isInteger(variant.lowStockAt) || variant.lowStockAt < 0)) {
      problems.push({
        path: `${path}.lowStockAt`,
        message: `The low-stock level of ${label} must be a whole number.`,
      });
    }
    for (const field of ['barcode', 'sku'] as const) {
      const code = variant[field].trim();
      if (!code) continue;
      if (!CODE_PATTERN.test(code)) {
        problems.push({
          path: `${path}.${field}`,
          message: `The ${field === 'sku' ? 'SKU' : 'barcode'} of ${label} must be 4 to 32 letters, digits, dots or dashes.`,
        });
      }
      const codeKey = `${field}:${code.toLowerCase()}`;
      const other = codes.get(codeKey);
      if (other)
        problems.push({ path: `${path}.${field}`, message: `${label} and ${other} have the same ${field}.` });
      codes.set(codeKey, label);
    }
  });
  return problems;
}

/** Lowest and highest price across variants, or null when there are none. */
export function priceRange(prices: Minor[]): { min: Minor; max: Minor } | null {
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** Options to offer from a preset's option sets: those with values become ready-made options. */
export function suggestedOptions(catalogueSeed: unknown): ProductOption[] {
  if (typeof catalogueSeed !== 'object' || catalogueSeed === null) return [];
  const sets = (catalogueSeed as { optionSets?: unknown }).optionSets;
  if (!Array.isArray(sets)) return [];
  return sets.flatMap((set) => {
    if (typeof set !== 'object' || set === null) return [];
    const { name, values } = set as { name?: unknown; values?: unknown };
    if (typeof name !== 'string') return [];
    return [
      { name, values: Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string') : [] },
    ];
  });
}

/** Category names a preset suggests. */
export function suggestedCategories(catalogueSeed: unknown): string[] {
  if (typeof catalogueSeed !== 'object' || catalogueSeed === null) return [];
  const categories = (catalogueSeed as { categories?: unknown }).categories;
  return Array.isArray(categories) ? categories.filter((c): c is string => typeof c === 'string') : [];
}
