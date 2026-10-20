// Business settings: everything that makes one shop's app look and read like its own.
// Stored as JSON in public.business_settings.settings. private.check_business_settings() in the
// database applies the same rules as validateSettings(); change both together.
//
// Reading is forgiving (parseSettings fills defaults and drops what it does not understand), so an
// older or partial record never breaks a screen. Saving is strict (validateSettings).

export const TERM_KEYS = [
  'product',
  'products',
  'customer',
  'customers',
  'receipt',
  'till',
  'cashier',
  'category',
  'categories',
] as const;
export type TermKey = (typeof TERM_KEYS)[number];

export const DEFAULT_TERMS: Record<TermKey, string> = {
  product: 'Product',
  products: 'Products',
  customer: 'Customer',
  customers: 'Customers',
  receipt: 'Receipt',
  till: 'Till',
  cashier: 'Cashier',
  category: 'Category',
  categories: 'Categories',
};

/** Settings grouped as they appear on the settings page; Managers may edit only the tabs allowed. */
export const SETTINGS_TABS = ['brand', 'terminology', 'receipt', 'channels', 'payments'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** Which stored key each tab owns. features and catalogueSeed belong to the platform developer. */
export const TAB_KEYS: Record<SettingsTab, keyof BusinessSettings> = {
  brand: 'brand',
  terminology: 'terminology',
  receipt: 'receipt',
  channels: 'channels',
  payments: 'paymentMethods',
};

export interface BrandLogo {
  /** Storage path of the colour logo shown on screens: "<businessId>/<file>". */
  screen: string;
  /** Storage path of the black version for receipt printers, when one was made. */
  receipt: string | null;
}

export interface BusinessSettings {
  brand: { colour: string; logo: BrandLogo | null };
  terminology: Partial<Record<TermKey, string>>;
  receipt: {
    header: string[];
    footer: string;
    showLogo: boolean;
    showCashier: boolean;
    showCustomer: boolean;
    showBarcode: boolean;
  };
  channels: string[];
  paymentMethods: string[];
  features: Record<string, boolean>;
  /** Starting categories and option sets from the preset; used when the catalogue is first set up. */
  catalogueSeed: unknown;
}

export const DEFAULT_BRAND_COLOUR: string = '#3346d3';

export const LIMITS = {
  termLength: 30,
  headerLines: 6,
  headerLineLength: 48,
  footerLength: 300,
  footerLines: 6,
  listItems: 12,
  listItemLength: 30,
  logoPathLength: 200,
} as const;

export function defaultSettings(): BusinessSettings {
  return {
    brand: { colour: DEFAULT_BRAND_COLOUR, logo: null },
    terminology: {},
    receipt: {
      header: [],
      footer: '',
      showLogo: true,
      showCashier: true,
      showCustomer: true,
      showBarcode: true,
    },
    channels: ['Walk-in'],
    paymentMethods: ['Cash', 'POS', 'Transfer'],
    features: {},
    catalogueSeed: null,
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isHex = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

/** Settings from the stored JSON, with defaults for anything missing or malformed. */
export function parseSettings(stored: unknown): BusinessSettings {
  const base = defaultSettings();
  if (!isObject(stored)) return base;

  const brand = isObject(stored.brand) ? stored.brand : {};
  const logo = isObject(brand.logo) && typeof brand.logo.screen === 'string' ? brand.logo : null;

  const terms: Partial<Record<TermKey, string>> = {};
  if (isObject(stored.terminology)) {
    for (const key of TERM_KEYS) {
      const value = stored.terminology[key];
      if (typeof value === 'string' && value.trim()) terms[key] = value.trim();
    }
  }

  const receipt = isObject(stored.receipt) ? stored.receipt : {};
  const features: Record<string, boolean> = {};
  if (isObject(stored.features)) {
    for (const [key, value] of Object.entries(stored.features))
      if (typeof value === 'boolean') features[key] = value;
  }
  const channels = strings(stored.channels);
  const paymentMethods = strings(stored.paymentMethods);

  return {
    brand: {
      colour: isHex(brand.colour) ? brand.colour.toLowerCase() : base.brand.colour,
      logo: logo
        ? { screen: logo.screen as string, receipt: typeof logo.receipt === 'string' ? logo.receipt : null }
        : null,
    },
    terminology: terms,
    receipt: {
      header: strings(receipt.header),
      footer: typeof receipt.footer === 'string' ? receipt.footer : '',
      showLogo: bool(receipt.showLogo, true),
      showCashier: bool(receipt.showCashier, true),
      showCustomer: bool(receipt.showCustomer, true),
      showBarcode: bool(receipt.showBarcode, true),
    },
    channels: channels.length ? channels : base.channels,
    paymentMethods: paymentMethods.length ? paymentMethods : base.paymentMethods,
    features,
    catalogueSeed: stored.catalogueSeed ?? null,
  };
}

/** The word a business uses, e.g. term(settings, 'products') → "Styles" for a fashion boutique. */
export function term(settings: Pick<BusinessSettings, 'terminology'>, key: TermKey): string {
  return settings.terminology[key] ?? DEFAULT_TERMS[key];
}

export interface SettingsProblem {
  /** Where the problem is, e.g. "channels.2". */
  path: string;
  message: string;
}

function checkList(problems: SettingsProblem[], path: string, items: string[], label: string): void {
  if (items.length === 0) problems.push({ path, message: `Add at least one ${label}.` });
  if (items.length > LIMITS.listItems) {
    problems.push({ path, message: `Use at most ${LIMITS.listItems} ${label}s.` });
  }
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const value = item.trim();
    if (!value) problems.push({ path: `${path}.${index}`, message: `A ${label} cannot be empty.` });
    else if (value.length > LIMITS.listItemLength) {
      problems.push({
        path: `${path}.${index}`,
        message: `"${value.slice(0, 20)}…" is longer than ${LIMITS.listItemLength} characters.`,
      });
    }
    const key = value.toLowerCase();
    if (value && seen.has(key))
      problems.push({ path: `${path}.${index}`, message: `"${value}" is listed twice.` });
    seen.add(key);
  });
}

/** Everything that would stop these settings being saved; empty when they are fine. */
export function validateSettings(settings: BusinessSettings, businessId: string): SettingsProblem[] {
  const problems: SettingsProblem[] = [];

  if (!isHex(settings.brand.colour))
    problems.push({ path: 'brand.colour', message: 'Use a colour like #7a1f5c.' });
  const logo = settings.brand.logo;
  if (logo) {
    for (const [key, path] of [
      ['screen', logo.screen],
      ['receipt', logo.receipt],
    ] as const) {
      if (path !== null && (!path.startsWith(`${businessId}/`) || path.length > LIMITS.logoPathLength)) {
        problems.push({ path: `brand.logo.${key}`, message: 'Upload the logo again.' });
      }
    }
  }

  for (const [key, value] of Object.entries(settings.terminology)) {
    if (!(TERM_KEYS as readonly string[]).includes(key)) {
      problems.push({ path: `terminology.${key}`, message: `"${key}" is not a word the app uses.` });
    } else if (typeof value !== 'string' || !value.trim() || value.trim().length > LIMITS.termLength) {
      problems.push({ path: `terminology.${key}`, message: `Use 1 to ${LIMITS.termLength} characters.` });
    }
  }

  const { header, footer } = settings.receipt;
  if (header.length > LIMITS.headerLines) {
    problems.push({ path: 'receipt.header', message: `Use at most ${LIMITS.headerLines} header lines.` });
  }
  header.forEach((line, index) => {
    if (line.length > LIMITS.headerLineLength) {
      problems.push({
        path: `receipt.header.${index}`,
        message: `Header line ${index + 1} is longer than ${LIMITS.headerLineLength} characters.`,
      });
    }
  });
  if (footer.length > LIMITS.footerLength) {
    problems.push({
      path: 'receipt.footer',
      message: `Keep the footer under ${LIMITS.footerLength} characters.`,
    });
  }
  if (footer.split('\n').length > LIMITS.footerLines) {
    problems.push({ path: 'receipt.footer', message: `Use at most ${LIMITS.footerLines} footer lines.` });
  }

  checkList(problems, 'channels', settings.channels, 'sales channel');
  checkList(problems, 'paymentMethods', settings.paymentMethods, 'payment method');

  for (const [key, value] of Object.entries(settings.features)) {
    if (!/^[a-zA-Z]{1,40}$/.test(key) || typeof value !== 'boolean') {
      problems.push({ path: `features.${key}`, message: 'Features can only be switched on or off.' });
    }
  }
  return problems;
}

/** Trims text and drops empty lines, the way settings are stored. */
export function cleanSettings(settings: BusinessSettings): BusinessSettings {
  const terminology: Partial<Record<TermKey, string>> = {};
  for (const [key, value] of Object.entries(settings.terminology) as [TermKey, string | undefined][]) {
    const cleaned = value?.trim();
    if (cleaned && cleaned !== DEFAULT_TERMS[key]) terminology[key] = cleaned;
  }
  return {
    ...settings,
    brand: { ...settings.brand, colour: settings.brand.colour.trim().toLowerCase() },
    terminology,
    receipt: {
      ...settings.receipt,
      header: settings.receipt.header.map((line) => line.trim()).filter(Boolean),
      footer: settings.receipt.footer.trim(),
    },
    channels: settings.channels.map((item) => item.trim()).filter(Boolean),
    paymentMethods: settings.paymentMethods.map((item) => item.trim()).filter(Boolean),
  };
}

/** The stored keys that differ between two versions of the settings. */
export function changedKeys(before: BusinessSettings, after: BusinessSettings): (keyof BusinessSettings)[] {
  const keys = Object.keys({ ...before, ...after }) as (keyof BusinessSettings)[];
  return keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

/** Who may change which tab. Platform developers and a business's Developer may change everything. */
export function editableTabs(
  rank: number | null,
  isPlatformDeveloper: boolean,
  managerEditable: readonly string[],
): Set<SettingsTab | 'features'> {
  if (isPlatformDeveloper || rank === 4) return new Set([...SETTINGS_TABS, 'features']);
  if (rank === 3) return new Set(SETTINGS_TABS.filter((tab) => managerEditable.includes(tab)));
  return new Set();
}

// ---------------------------------------------------------------------------------------------
// Device settings, stored on public.devices.settings
// ---------------------------------------------------------------------------------------------

export interface DeviceSettings {
  paperWidth: 58 | 80;
  autoPrint: boolean;
  copies: number;
  /** Minutes of no use before the till locks; 0 means never. */
  autoLockMinutes: number;
}

export function defaultDeviceSettings(): DeviceSettings {
  return { paperWidth: 80, autoPrint: true, copies: 1, autoLockMinutes: 10 };
}

export function parseDeviceSettings(stored: unknown): DeviceSettings {
  const base = defaultDeviceSettings();
  if (!isObject(stored)) return base;
  return {
    paperWidth: stored.paperWidth === 58 ? 58 : 80,
    autoPrint: bool(stored.autoPrint, base.autoPrint),
    copies:
      Number.isInteger(stored.copies) && (stored.copies as number) >= 1 && (stored.copies as number) <= 3
        ? (stored.copies as number)
        : base.copies,
    autoLockMinutes:
      Number.isInteger(stored.autoLockMinutes) &&
      (stored.autoLockMinutes as number) >= 0 &&
      (stored.autoLockMinutes as number) <= 120
        ? (stored.autoLockMinutes as number)
        : base.autoLockMinutes,
  };
}

/** Characters per receipt line for a paper width, at the printer's standard font. */
export function receiptLineWidth(paperWidth: DeviceSettings['paperWidth']): number {
  return paperWidth === 58 ? 32 : 48;
}
