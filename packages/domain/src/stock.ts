// Stock levels and expiry. Stock can go below zero (a sale is never refused for stock); screens
// show it so someone recounts.

export type StockStatus = 'out' | 'low' | 'ok';

export function stockStatus(onHand: number, lowStockAt: number | null): StockStatus {
  if (onHand <= 0) return 'out';
  if (lowStockAt !== null && onHand <= lowStockAt) return 'low';
  return 'ok';
}

export const STOCK_REASONS = ['receive', 'adjust', 'count', 'damage', 'return', 'sale'] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

/** What a person enters, turned into the change in stock. */
export function stockChange(
  reason: Exclude<StockReason, 'sale' | 'return'>,
  entered: number,
  onHand: number,
): number {
  if (!Number.isInteger(entered)) throw new RangeError('Enter a whole number');
  switch (reason) {
    case 'receive':
      if (entered <= 0) throw new RangeError('Receive at least one');
      return entered;
    case 'damage':
      if (entered <= 0) throw new RangeError('Enter how many are damaged or lost');
      return -entered;
    case 'adjust':
      if (entered === 0) throw new RangeError('Enter a change other than zero');
      return entered;
    case 'count':
      if (entered < 0) throw new RangeError('A count cannot be below zero');
      return entered - onHand;
  }
}

export type ExpiryStatus = 'expired' | 'soon' | 'ok';

/** Days from a business day to an expiry date, both "YYYY-MM-DD". */
export function daysUntil(today: string, expiresOn: string): number {
  return Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function expiryStatus(today: string, expiresOn: string | null, warnDays = 60): ExpiryStatus {
  if (!expiresOn) return 'ok';
  const days = daysUntil(today, expiresOn);
  if (days < 0) return 'expired';
  if (days <= warnDays) return 'soon';
  return 'ok';
}
