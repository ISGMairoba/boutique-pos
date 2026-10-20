// Money is always a whole number of minor units (kobo for NGN, cents for USD) with the business
// currency kept beside it. Convert to text only for display, and parse typed amounts with
// parseAmount so no floating-point arithmetic ever touches a stored value.

export type Minor = number;

export interface MoneyFormat {
  currency: string;
  locale: string;
}

/** Number of minor-unit digits for a currency (2 for NGN, 0 for JPY). */
export function minorDigits(currency: string): number {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

/** Whether a value is a safe whole number of minor units. */
export function isMinor(value: unknown): value is Minor {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * Parse an amount typed by a person ("12,500", "12500.5", "₦1,200.00") into minor units.
 * Returns null for anything that is not a plain amount with at most the currency's decimals.
 */
export function parseAmount(input: string, currency = 'NGN'): Minor | null {
  const digits = minorDigits(currency);
  const cleaned = input.replace(/[\s,]/g, '').replace(/^[^\d.-]+/, '');
  const match = /^(-)?(\d+)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return null;
  const [, sign, whole = '', fraction = ''] = match;
  if (fraction.length > digits) return null;
  const minor = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0') || '0');
  if (!Number.isSafeInteger(minor)) return null;
  return sign ? -minor : minor;
}

/** Format minor units for display, e.g. 1782000 → "₦17,820.00". */
export function formatMoney(minor: Minor, { currency, locale }: MoneyFormat): string {
  const digits = minorDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}

/** Multiply a unit price by a quantity, keeping the result whole. */
export function lineTotal(unitPrice: Minor, quantity: number): Minor {
  if (!isMinor(unitPrice) || !Number.isInteger(quantity))
    throw new RangeError('Price and quantity must be whole numbers');
  const total = unitPrice * quantity;
  if (!Number.isSafeInteger(total)) throw new RangeError('Amount is too large');
  return total;
}

/** A percentage of an amount, rounded half up to the nearest minor unit. */
export function percentOf(amount: Minor, percent: number): Minor {
  if (!isMinor(amount) || !Number.isFinite(percent)) throw new RangeError('Invalid amount or percentage');
  return Math.round((amount * percent) / 100);
}
