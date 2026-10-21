// Barcodes. Shops keep the codes printed on goods by suppliers; for goods without one the app makes
// an internal EAN-13 number in the 20–29 "in-store" range, so it never clashes with a real product
// code. Labels print as Code 128, which every scanner reads and which encodes digits compactly.

/** The EAN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new RangeError('An EAN-13 starts with 12 digits');
  const sum = [...first12].reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/**
 * A new internal barcode: "20" followed by 10 random digits and the check digit.
 * `random` returns digits; pass a deterministic one in tests.
 */
export function internalBarcode(random: (count: number) => string = randomDigits): string {
  const body = `20${random(10)}`;
  return `${body}${ean13CheckDigit(body)}`;
}

function randomDigits(count: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(count));
  return [...bytes].map((byte) => String(byte % 10)).join('');
}

// Code 128 patterns: bar and space widths for each symbol value 0–106 (106 is the stop symbol).
const PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
];

const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;

/**
 * Code 128 symbol values for text: set C for runs of 4 or more digits (two digits per symbol),
 * set B otherwise. Includes start, checksum and stop.
 */
export function code128Symbols(text: string): number[] {
  if (!text || ![...text].every((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126)) {
    throw new RangeError('Code 128 labels hold printable ASCII characters only');
  }
  const symbols: number[] = [];
  const digitRun = (from: number) => {
    let end = from;
    while (end < text.length && /\d/.test(text[end] ?? '')) end++;
    return end - from;
  };
  let set: 'B' | 'C';
  let i = 0;
  const first = digitRun(0);
  if (first >= 4 && first % 2 === 0) {
    set = 'C';
    symbols.push(START_C);
  } else {
    set = 'B';
    symbols.push(START_B);
  }
  while (i < text.length) {
    const run = digitRun(i);
    if (set === 'C') {
      if (run >= 2) {
        symbols.push(Number(text.slice(i, i + 2)));
        i += 2;
        continue;
      }
      symbols.push(CODE_B);
      set = 'B';
    }
    // In set B: switch to C for an even-length run of 4+ digits (or a 4+ run, leaving one digit in B).
    if (run >= 4) {
      if (run % 2 === 1) {
        symbols.push((text.charCodeAt(i) ?? 32) - 32);
        i++;
      }
      symbols.push(CODE_C);
      set = 'C';
      continue;
    }
    symbols.push((text.charCodeAt(i) ?? 32) - 32);
    i++;
  }
  const checksum = symbols.reduce((sum, value, index) => sum + value * (index === 0 ? 1 : index), 0) % 103;
  symbols.push(checksum, 106);
  return symbols;
}

/** Bar and space widths, in modules, starting with a bar. */
export function code128Widths(text: string): number[] {
  return code128Symbols(text).flatMap((value) => [...(PATTERNS[value] ?? '')].map(Number));
}
