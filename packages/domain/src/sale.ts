// Selling: the cart, discounts, payments and the sale record a till saves.
//
// A sale is a fact. Once money is taken, the till saves the sale locally in one step and the server
// accepts it later, even with negative stock or a changed price. public.apply_sale() checks the same
// arithmetic as checkSale() and flags (never refuses) problems such as a discount over the cashier's
// limit; change both together.

import { businessDate } from './business-date.ts';
import { isMinor, lineTotal, type Minor } from './money.ts';
import type { SellingSettings } from './settings.ts';

export const SALE_LIMITS = {
  lines: 200,
  quantity: 9999,
  payments: 6,
  noteLength: 200,
  customerNameLength: 80,
} as const;

export interface CartLine {
  /** A new id per line, kept when the line is saved. */
  id: string;
  variantId: string;
  productId: string;
  name: string;
  optionValues: string[];
  sku: string | null;
  barcode: string | null;
  /** The price charged for one, as it was in the catalogue when the item was added. */
  unitPrice: Minor;
  quantity: number;
  /** Amount off this line. */
  discount: Minor;
}

export interface Payment {
  id: string;
  method: string;
  amount: Minor;
}

export interface SaleLineTotal {
  id: string;
  /** unitPrice × quantity. */
  gross: Minor;
  /** This line's part of the whole-sale discount. */
  saleDiscountShare: Minor;
  /** What the customer paid for this line: gross − line discount − share of the sale discount. */
  net: Minor;
}

export interface SaleTotals {
  subtotal: Minor;
  lineDiscounts: Minor;
  saleDiscount: Minor;
  /** Line discounts plus the whole-sale discount. */
  discount: Minor;
  total: Minor;
  items: number;
  lines: SaleLineTotal[];
}

/** Adds one of a variant, or one more if it is already in the cart. */
export function addToCart(
  lines: readonly CartLine[],
  item: Omit<CartLine, 'id' | 'quantity' | 'discount'>,
  newId: () => string,
): CartLine[] {
  const index = lines.findIndex((line) => line.variantId === item.variantId && line.unitPrice === item.unitPrice);
  if (index === -1) return [...lines, { ...item, id: newId(), quantity: 1, discount: 0 }];
  return lines.map((line, i) => (i === index ? { ...line, quantity: Math.min(line.quantity + 1, SALE_LIMITS.quantity) } : line));
}

/**
 * Shares a whole-sale discount across lines in proportion to what each line costs after its own
 * discount. Shares are whole minor units; leftover units go to the lines with the largest remainders
 * (earlier lines first on a tie), so the shares always add up to the discount exactly.
 */
export function shareDiscount(weights: readonly Minor[], discount: Minor): Minor[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (discount === 0 || total <= 0) return weights.map(() => 0);
  const big = BigInt(discount);
  const bigTotal = BigInt(total);
  const shares = weights.map((weight) => Number((big * BigInt(weight)) / bigTotal));
  const remainders = weights.map((weight, index) => ({ index, rest: (big * BigInt(weight)) % bigTotal }));
  let left = discount - shares.reduce((sum, share) => sum + share, 0);
  remainders.sort((a, b) => (a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1));
  for (const { index } of remainders) {
    if (left === 0) break;
    shares[index] = (shares[index] ?? 0) + 1;
    left -= 1;
  }
  return shares;
}

export function saleTotals(lines: readonly CartLine[], saleDiscount: Minor): SaleTotals {
  const gross = lines.map((line) => lineTotal(line.unitPrice, line.quantity));
  const afterLine = lines.map((line, index) => (gross[index] ?? 0) - line.discount);
  const shares = shareDiscount(
    afterLine.map((amount) => Math.max(0, amount)),
    saleDiscount,
  );
  const subtotal = gross.reduce((sum, amount) => sum + amount, 0);
  const lineDiscounts = lines.reduce((sum, line) => sum + line.discount, 0);
  return {
    subtotal,
    lineDiscounts,
    saleDiscount,
    discount: lineDiscounts + saleDiscount,
    total: subtotal - lineDiscounts - saleDiscount,
    items: lines.reduce((sum, line) => sum + line.quantity, 0),
    lines: lines.map((line, index) => ({
      id: line.id,
      gross: gross[index] ?? 0,
      saleDiscountShare: shares[index] ?? 0,
      net: (afterLine[index] ?? 0) - (shares[index] ?? 0),
    })),
  };
}

/** The biggest discount, in whole percent, someone of this rank may give. A Developer has no limit. */
export function discountLimitFor(selling: Pick<SellingSettings, 'discountLimits'>, rank: number | null): number {
  if (rank === null || rank < 1) return 0;
  if (rank >= 4) return 100;
  return selling.discountLimits[rank === 3 ? 'manager' : rank === 2 ? 'admin' : 'cashier'];
}

/** The biggest discount allowed on a subtotal at a percentage limit, rounded down. */
export function maxDiscount(subtotal: Minor, limitPercent: number): Minor {
  return Math.floor((subtotal * limitPercent) / 100);
}

export interface Settlement {
  paid: Minor;
  /** Still to pay; 0 once paid in full. */
  due: Minor;
  /** Cash to hand back. */
  change: Minor;
  problems: string[];
  /** Paid in full with nothing wrong: the sale can be completed. */
  complete: boolean;
}

/**
 * How the payments cover a total. Only the cash method may be more than what is due; the
 * difference is change, and it cannot be more than the cash given.
 */
export function settle(total: Minor, payments: readonly Payment[], cashMethod: string | null): Settlement {
  const problems: string[] = [];
  if (payments.some((payment) => !isMinor(payment.amount) || payment.amount <= 0)) {
    problems.push('Enter each payment as an amount above zero.');
  }
  if (payments.length > SALE_LIMITS.payments) problems.push(`Use at most ${SALE_LIMITS.payments} payments.`);
  const paid = payments.reduce((sum, payment) => sum + (isMinor(payment.amount) ? payment.amount : 0), 0);
  const cashPaid = payments
    .filter((payment) => cashMethod !== null && payment.method === cashMethod)
    .reduce((sum, payment) => sum + Math.max(0, payment.amount), 0);
  const over = Math.max(0, paid - total);
  if (over > cashPaid) {
    problems.push(
      cashMethod
        ? `Only ${cashMethod} can be more than what is due. Lower the other payments.`
        : 'The payments add up to more than the total. Lower one of them.',
    );
  }
  const change = over <= cashPaid ? over : 0;
  const due = Math.max(0, total - paid);
  return { paid, due, change, problems, complete: problems.length === 0 && due === 0 };
}

/** A receipt number such as "LR-02-000418": business prefix, device code, then the device's count. */
export function receiptNumber(prefix: string, deviceCode: string, number: number): string {
  return `${prefix}-${deviceCode}-${String(number).padStart(6, '0')}`;
}

/** A phone number as typed, with spaces and punctuation removed; null if it is not a phone number. */
export function normalisePhone(input: string): string | null {
  const cleaned = input.replace(/[\s().-]/g, '');
  return /^\+?\d{7,15}$/.test(cleaned) ? cleaned : null;
}

export interface SaleDraft {
  lines: CartLine[];
  saleDiscount: Minor;
  channel: string;
  customerName: string;
  customerPhone: string;
  note: string;
  payments: Payment[];
}

export interface SaleRules {
  channels: readonly string[];
  paymentMethods: readonly string[];
  cashMethod: string | null;
  /** Whole percent the person selling may discount. */
  discountLimit: number;
}

export function emptySale(channel: string): SaleDraft {
  return { lines: [], saleDiscount: 0, channel, customerName: '', customerPhone: '', note: '', payments: [] };
}

/** Everything that stops this sale being completed, in plain words; empty when it can be. */
export function checkSale(draft: SaleDraft, rules: SaleRules): string[] {
  const problems: string[] = [];
  if (draft.lines.length === 0) problems.push('Add at least one item.');
  if (draft.lines.length > SALE_LIMITS.lines) problems.push(`A sale can have at most ${SALE_LIMITS.lines} lines.`);
  for (const line of draft.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > SALE_LIMITS.quantity) {
      problems.push(`Enter a quantity from 1 to ${SALE_LIMITS.quantity} for ${line.name}.`);
    }
    if (!isMinor(line.unitPrice) || line.unitPrice < 0) problems.push(`${line.name} has no valid price.`);
    if (!isMinor(line.discount) || line.discount < 0) problems.push(`The discount on ${line.name} cannot be below zero.`);
    else if (Number.isInteger(line.quantity) && isMinor(line.unitPrice) && line.discount > line.unitPrice * line.quantity) {
      problems.push(`The discount on ${line.name} is more than the line costs.`);
    }
  }
  if (problems.length) return problems;

  const totals = saleTotals(draft.lines, 0);
  if (!isMinor(draft.saleDiscount) || draft.saleDiscount < 0) problems.push('The discount cannot be below zero.');
  else if (draft.saleDiscount > totals.total) problems.push('The discount is more than the sale.');
  else if (totals.discount + draft.saleDiscount > maxDiscount(totals.subtotal, rules.discountLimit)) {
    problems.push(
      rules.discountLimit === 0
        ? 'You cannot give discounts. Ask a Manager.'
        : `You can give at most ${rules.discountLimit}% off. Ask a Manager for more.`,
    );
  }
  if (!rules.channels.includes(draft.channel)) problems.push('Choose a sales channel.');
  if (draft.customerPhone.trim() && !normalisePhone(draft.customerPhone)) {
    problems.push('Enter the phone number with 7 to 15 digits, or leave it empty.');
  }
  if (draft.customerName.trim().length > SALE_LIMITS.customerNameLength) {
    problems.push(`Keep the customer name under ${SALE_LIMITS.customerNameLength} characters.`);
  }
  if (draft.note.trim().length > SALE_LIMITS.noteLength) problems.push(`Keep the note under ${SALE_LIMITS.noteLength} characters.`);
  if (draft.payments.some((payment) => !rules.paymentMethods.includes(payment.method))) {
    problems.push('One payment uses a method this business no longer takes. Remove it.');
  }
  if (problems.length) return problems;

  const settlement = settle(saleTotals(draft.lines, draft.saleDiscount).total, draft.payments, rules.cashMethod);
  problems.push(...settlement.problems);
  if (settlement.due > 0) problems.push('Take the rest of the payment.');
  return problems;
}

export interface SaleLineRecord {
  id: string;
  variantId: string;
  productId: string;
  name: string;
  optionValues: string[];
  sku: string | null;
  barcode: string | null;
  unitPrice: Minor;
  quantity: number;
  discount: Minor;
  saleDiscountShare: Minor;
  net: Minor;
}

/** The sale as the till saves it and sends it to the server in a sale.completed event. */
export interface SaleRecord {
  id: string;
  number: number;
  receiptNo: string;
  deviceId: string;
  deviceCode: string;
  soldAt: string;
  businessDate: string;
  channel: string;
  cashierId: string;
  cashierName: string;
  customerName: string | null;
  customerPhone: string | null;
  note: string | null;
  lines: SaleLineRecord[];
  subtotal: Minor;
  saleDiscount: Minor;
  discount: Minor;
  total: Minor;
  payments: Payment[];
  paid: Minor;
  change: Minor;
}

export interface SaleMeta {
  id: string;
  number: number;
  receiptPrefix: string;
  deviceId: string;
  deviceCode: string;
  soldAt: Date;
  timeZone: string;
  cashierId: string;
  cashierName: string;
}

/** The record of a completed sale. Call checkSale() first; this does not repeat its checks. */
export function buildSale(draft: SaleDraft, meta: SaleMeta, cashMethod: string | null): SaleRecord {
  const totals = saleTotals(draft.lines, draft.saleDiscount);
  const settlement = settle(totals.total, draft.payments, cashMethod);
  return {
    id: meta.id,
    number: meta.number,
    receiptNo: receiptNumber(meta.receiptPrefix, meta.deviceCode, meta.number),
    deviceId: meta.deviceId,
    deviceCode: meta.deviceCode,
    soldAt: meta.soldAt.toISOString(),
    businessDate: businessDate(meta.soldAt, meta.timeZone),
    channel: draft.channel,
    cashierId: meta.cashierId,
    cashierName: meta.cashierName,
    customerName: draft.customerName.trim() || null,
    customerPhone: normalisePhone(draft.customerPhone),
    note: draft.note.trim() || null,
    lines: draft.lines.map((line, index) => {
      const total = totals.lines[index];
      return {
        id: line.id,
        variantId: line.variantId,
        productId: line.productId,
        name: line.name,
        optionValues: line.optionValues,
        sku: line.sku,
        barcode: line.barcode,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        discount: line.discount,
        saleDiscountShare: total?.saleDiscountShare ?? 0,
        net: total?.net ?? 0,
      };
    }),
    subtotal: totals.subtotal,
    saleDiscount: totals.saleDiscount,
    discount: totals.discount,
    total: totals.total,
    payments: draft.payments,
    paid: settlement.paid,
    change: settlement.change,
  };
}
