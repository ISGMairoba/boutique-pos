import type { Json } from '@boutique/db-types';
import {
  type BusinessSettings,
  changedKeys,
  cleanSettings,
  DEFAULT_BRAND_COLOUR,
  DEFAULT_TERMS,
  editableTabs,
  LIMITS,
  type SettingsProblem,
  type SettingsTab,
  TERM_KEYS,
  type TermKey,
  validateSettings,
} from '@boutique/domain';
import {
  Button,
  buildBrandPalette,
  cn,
  FieldHint,
  Input,
  isHexColour,
  Label,
  Notice,
  Textarea,
} from '@boutique/ui';
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { brandAssetUrl } from '../../lib/business.ts';
import { errorMessage, supabase } from '../../lib/supabase.ts';
import { useBusinessContext } from '../business/BusinessLayout.tsx';
import { DeviceSettingsTab, savedDeviceSettings } from './DeviceSettingsTab.tsx';
import { ListEditor } from './ListEditor.tsx';
import { checkLogoFile, uploadLogo } from './logo.ts';
import { ReceiptPreview } from './ReceiptPreview.tsx';

type Tab = SettingsTab | 'features' | 'device';

const TAB_LABEL: Record<Tab, string> = {
  brand: 'Brand',
  terminology: 'Wording',
  receipt: 'Receipt',
  channels: 'Sales channels',
  payments: 'Payment methods',
  features: 'Features',
  device: 'This device',
};

/** Which tab a validation problem belongs to. */
const PATH_TAB: Record<string, Tab> = {
  brand: 'brand',
  terminology: 'terminology',
  receipt: 'receipt',
  channels: 'channels',
  paymentMethods: 'payments',
  features: 'features',
};

const TERM_LABEL: Record<TermKey, string> = {
  product: 'One product',
  products: 'Many products',
  customer: 'One customer',
  customers: 'Many customers',
  receipt: 'Receipt',
  till: 'Till',
  cashier: 'Cashier',
  category: 'One category',
  categories: 'Many categories',
};

const FEATURE_LABEL: Record<string, string> = {
  variants: 'Sizes, colours and other options',
  exchanges: 'Returns and exchanges',
  batches: 'Batches and expiry dates',
  expiryAlerts: 'Expiry alerts',
  giftReceipts: 'Gift receipts without prices',
  sizeGridReceiving: 'Receive stock by size grid',
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function SettingsPage() {
  const { business, reload, licence, isDeveloper } = useBusinessContext();
  const ids = { name: useId(), colour: useId(), header: useId(), footer: useId(), logo: useId() };
  const [tab, setTab] = useState<Tab>('brand');
  const [draft, setDraft] = useState<BusinessSettings>(business.settings);
  const [name, setName] = useState(business.name);
  const [paperWidth, setPaperWidth] = useState<58 | 80>(() => savedDeviceSettings(business.id).paperWidth);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [done, setDone] = useState('');

  // Start again from the server's copy whenever a new version arrives.
  useEffect(() => {
    setDraft(business.settings);
    setName(business.name);
  }, [business.settings, business.name]);

  const editable = useMemo(
    () => editableTabs(business.rank, isDeveloper, business.managerEditable),
    [business.rank, isDeveloper, business.managerEditable],
  );
  const canEditFeatures = editable.has('features');
  const tabs: Tab[] = [
    'brand',
    'terminology',
    'receipt',
    'channels',
    'payments',
    ...(canEditFeatures ? (['features'] as const) : []),
    'device',
  ];
  const can = (t: Tab) =>
    t === 'device' ? (business.rank ?? 0) >= 2 : editable.has(t as SettingsTab | 'features');

  const cleaned = useMemo(() => cleanSettings(draft), [draft]);
  const changed = useMemo(() => changedKeys(business.settings, cleaned), [business.settings, cleaned]);
  const nameChanged = name.trim() !== business.name;
  const dirty = changed.length > 0 || nameChanged;

  const colourProblem = useMemo(() => {
    if (!isHexColour(draft.brand.colour)) return 'Use a colour like #7a1f5c.';
    try {
      buildBrandPalette(draft.brand.colour);
      return '';
    } catch (failure) {
      return errorMessage(failure);
    }
  }, [draft.brand.colour]);

  const problems: SettingsProblem[] = useMemo(() => {
    const list = validateSettings(cleaned, business.id);
    if (colourProblem && !list.some((p) => p.path === 'brand.colour')) {
      list.push({ path: 'brand.colour', message: colourProblem });
    }
    if (nameChanged && (name.trim().length < 1 || name.trim().length > 120)) {
      list.push({ path: 'brand.name', message: 'Use a business name of 1 to 120 characters.' });
    }
    return list;
  }, [cleaned, business.id, colourProblem, nameChanged, name]);

  const problemTabs = new Set(problems.map((p) => PATH_TAB[p.path.split('.')[0] ?? ''] ?? 'brand'));
  const tabProblems = problems.filter((p) => (PATH_TAB[p.path.split('.')[0] ?? ''] ?? 'brand') === tab);

  const edit = (change: (current: BusinessSettings) => BusinessSettings) => {
    setDone('');
    setDraft((current) => change(current));
  };

  async function save() {
    if (!supabase || problems.length > 0) return;
    setBusy(true);
    setError('');
    setConflict(false);
    setDone('');
    // Send back the stored document with only the changed parts replaced, so parts this person may
    // not edit stay exactly as they were.
    const payload: Record<string, unknown> = { ...business.storedSettings };
    for (const key of changed) payload[key] = cleaned[key];
    const { error: saveError } = await supabase.rpc('save_business_settings', {
      p_business: business.id,
      p_version: business.settingsVersion,
      p_settings: payload as Json,
      p_name: nameChanged ? name.trim() : undefined,
    });
    setBusy(false);
    if (saveError) {
      setConflict(saveError.code === 'BPVER');
      setError(errorMessage(saveError));
      return;
    }
    await reload();
    setDone('Settings saved. Every device picks them up the next time it opens the business.');
  }

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    const problem = checkLogoFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setUploading(true);
    setError('');
    try {
      const logo = await uploadLogo(business.id, file);
      edit((current) => ({ ...current, brand: { ...current.brand, logo } }));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setUploading(false);
    }
  }

  const disabled = !can(tab);
  const screenLogo = brandAssetUrl(draft.brand.logo?.screen);
  const receiptLogo = brandAssetUrl(draft.brand.logo?.receipt ?? draft.brand.logo?.screen);

  return (
    <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Settings" className="flex gap-1 overflow-x-auto lg:flex-col">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-current={tab === t ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium',
              tab === t
                ? 'bg-primary-soft text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {TAB_LABEL[t]}
            {problemTabs.has(t) && (
              <span className="h-2 w-2 rounded-full bg-destructive">
                <span className="sr-only">(needs fixing)</span>
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="grid min-w-0 gap-5">
        {tab !== 'device' && disabled && (
          <Notice>
            {(business.rank ?? 0) >= 3
              ? 'Your installer has not allowed Managers to change this. Ask them if it needs changing.'
              : 'Only a Manager can change these settings.'}
          </Notice>
        )}
        {tabProblems.length > 0 && (
          <Notice tone="danger">
            <ul className="grid gap-1">
              {tabProblems.map((p) => (
                <li key={`${p.path}-${p.message}`}>{p.message}</li>
              ))}
            </ul>
          </Notice>
        )}

        {tab === 'brand' && (
          <Section title="Brand" description="How the business looks on every screen and receipt.">
            <div className="grid max-w-xl gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor={ids.name}>Business name</Label>
                <Input
                  id={ids.name}
                  maxLength={120}
                  value={name}
                  disabled={disabled}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={ids.colour}>Brand colour</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    aria-label="Pick brand colour"
                    disabled={disabled}
                    value={isHexColour(draft.brand.colour) ? draft.brand.colour : DEFAULT_BRAND_COLOUR}
                    onChange={(e) => edit((c) => ({ ...c, brand: { ...c.brand, colour: e.target.value } }))}
                    className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
                  />
                  <Input
                    id={ids.colour}
                    className="w-32"
                    disabled={disabled}
                    value={draft.brand.colour}
                    onChange={(e) =>
                      edit((c) => ({ ...c, brand: { ...c.brand, colour: e.target.value.trim() } }))
                    }
                  />
                  {!colourProblem && (
                    <span
                      className="rounded-md px-3 py-2 text-sm font-medium"
                      style={(() => {
                        const p = buildBrandPalette(draft.brand.colour).light;
                        return { background: p.primary, color: p.primaryForeground };
                      })()}
                    >
                      Pay now
                    </span>
                  )}
                </div>
                <FieldHint error={Boolean(colourProblem)}>
                  {colourProblem || 'Used for buttons and highlights. A lighter shade is made for dark mode.'}
                </FieldHint>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={ids.logo}>Logo</Label>
                {draft.brand.logo ? (
                  <div className="flex flex-wrap items-end gap-4">
                    {screenLogo && (
                      <figure className="grid gap-1 text-xs text-muted-foreground">
                        <img
                          src={screenLogo}
                          alt="Logo"
                          className="h-16 max-w-48 rounded border bg-card object-contain p-1"
                        />
                        Screens
                      </figure>
                    )}
                    {draft.brand.logo.receipt && receiptLogo && (
                      <figure className="grid gap-1 text-xs text-muted-foreground">
                        <img
                          src={receiptLogo}
                          alt="Receipt logo"
                          className="h-16 max-w-48 rounded border bg-card object-contain p-1"
                        />
                        Receipts
                      </figure>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No logo yet.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <label
                    htmlFor={ids.logo}
                    className={cn(
                      'inline-flex h-9 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted',
                      (disabled || uploading) && 'pointer-events-none opacity-50',
                    )}
                  >
                    {uploading ? 'Uploading…' : draft.brand.logo ? 'Upload a new logo' : 'Upload logo'}
                  </label>
                  <input
                    id={ids.logo}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="sr-only"
                    disabled={disabled || uploading}
                    onChange={(e) => {
                      void pickLogo(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  {draft.brand.logo && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      onClick={() => edit((c) => ({ ...c, brand: { ...c.brand, logo: null } }))}
                    >
                      Remove logo
                    </Button>
                  )}
                </div>
                <FieldHint>
                  PNG, JPEG, WebP or SVG up to 512 KB. A black version for receipt printers is made for you.
                </FieldHint>
              </div>
            </div>
          </Section>
        )}

        {tab === 'terminology' && (
          <Section
            title="Wording"
            description="The words staff see on screens and receipts. Leave a box empty to use the usual word."
          >
            <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
              {TERM_KEYS.map((key) => (
                <div key={key} className="grid gap-1.5">
                  <Label htmlFor={`${ids.name}-term-${key}`}>{TERM_LABEL[key]}</Label>
                  <Input
                    id={`${ids.name}-term-${key}`}
                    maxLength={LIMITS.termLength}
                    placeholder={DEFAULT_TERMS[key]}
                    disabled={disabled}
                    value={draft.terminology[key] ?? ''}
                    onChange={(e) =>
                      edit((c) => ({ ...c, terminology: { ...c.terminology, [key]: e.target.value } }))
                    }
                  />
                </div>
              ))}
            </div>
          </Section>
        )}

        {tab === 'receipt' && (
          <Section title="Receipt" description="What every printed or shared receipt shows.">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">
              <div className="grid content-start gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor={ids.header}>Lines under the business name</Label>
                  <Textarea
                    id={ids.header}
                    rows={4}
                    disabled={disabled}
                    placeholder={'12 Admiralty Way, Lekki\n0803 000 0000'}
                    value={draft.receipt.header.join('\n')}
                    onChange={(e) =>
                      edit((c) => ({ ...c, receipt: { ...c.receipt, header: e.target.value.split('\n') } }))
                    }
                  />
                  <FieldHint>
                    Address, phone, social handles. Up to {LIMITS.headerLines} lines of{' '}
                    {LIMITS.headerLineLength} characters.
                  </FieldHint>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={ids.footer}>Footer</Label>
                  <Textarea
                    id={ids.footer}
                    rows={3}
                    maxLength={LIMITS.footerLength}
                    disabled={disabled}
                    placeholder="Thank you for shopping with us"
                    value={draft.receipt.footer}
                    onChange={(e) =>
                      edit((c) => ({ ...c, receipt: { ...c.receipt, footer: e.target.value } }))
                    }
                  />
                  <FieldHint>
                    Return policy, thank-you note. Up to {LIMITS.footerLength} characters.
                  </FieldHint>
                </div>
                <fieldset className="grid gap-2 text-sm">
                  <legend className="mb-1 font-medium">Show on the receipt</legend>
                  {(
                    [
                      ['showLogo', 'Logo'],
                      ['showCashier', 'Who served the customer'],
                      ['showCustomer', 'Customer name and sales channel'],
                      ['showBarcode', 'Barcode of the receipt number (for returns)'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={draft.receipt[key]}
                        onChange={(e) =>
                          edit((c) => ({ ...c, receipt: { ...c.receipt, [key]: e.target.checked } }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Preview on</span>
                  {([80, 58] as const).map((width) => (
                    <Button
                      key={width}
                      size="sm"
                      variant={paperWidth === width ? 'default' : 'outline'}
                      onClick={() => setPaperWidth(width)}
                    >
                      {width} mm
                    </Button>
                  ))}
                </div>
              </div>
              <ReceiptPreview
                settings={cleaned}
                businessName={name.trim() || business.name}
                receiptPrefix={business.receiptPrefix}
                deviceCode={licence.licence?.payload.deviceCode ?? '01'}
                logoUrl={receiptLogo}
                paperWidth={paperWidth}
                currency={business.currency}
                locale={business.locale}
                timeZone={business.timeZone}
              />
            </div>
          </Section>
        )}

        {tab === 'channels' && (
          <Section
            title="Sales channels"
            description="Where a sale came from, chosen at checkout. Reports show sales by channel. The first is the default."
          >
            <div className="max-w-md">
              <ListEditor
                items={draft.channels}
                disabled={disabled}
                max={LIMITS.listItems}
                addLabel="Add channel"
                itemLabel="Channel"
                onChange={(channels) => edit((c) => ({ ...c, channels }))}
              />
            </div>
          </Section>
        )}

        {tab === 'payments' && (
          <Section
            title="Payment methods"
            description="How customers can pay, in the order shown at checkout. Cash counts towards the drawer."
          >
            <div className="max-w-md">
              <ListEditor
                items={draft.paymentMethods}
                disabled={disabled}
                max={LIMITS.listItems}
                addLabel="Add payment method"
                itemLabel="Payment method"
                onChange={(paymentMethods) => edit((c) => ({ ...c, paymentMethods }))}
              />
            </div>
          </Section>
        )}

        {tab === 'features' && (
          <Section
            title="Features"
            description="Parts of the app this business uses. Only you can change these."
          >
            <div className="grid gap-2 text-sm">
              {Object.keys({ ...FEATURE_LABEL, ...draft.features }).map((key) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!canEditFeatures}
                    checked={draft.features[key] === true}
                    onChange={(e) =>
                      edit((c) => ({ ...c, features: { ...c.features, [key]: e.target.checked } }))
                    }
                  />
                  {FEATURE_LABEL[key] ?? key}
                </label>
              ))}
            </div>
          </Section>
        )}

        {tab === 'device' && (
          <Section
            title="This device"
            description="Printer and lock settings for the device you are using now."
          >
            <DeviceSettingsTab
              business={business}
              deviceCode={licence.licence?.payload.deviceCode ?? null}
              onPaperChange={setPaperWidth}
            />
          </Section>
        )}

        {tab !== 'device' && (
          <div className="sticky bottom-0 z-10 -mx-4 grid gap-3 border-t bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            {error && (
              <Notice tone="danger">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{error}</span>
                  {conflict && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await reload();
                        setError('');
                        setConflict(false);
                      }}
                    >
                      Reload settings
                    </Button>
                  )}
                </div>
              </Notice>
            )}
            {done && <Notice tone="success">{done}</Notice>}
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={!dirty || busy || problems.length > 0 || editable.size === 0}>
                {busy ? 'Saving…' : 'Save settings'}
              </Button>
              <Button
                variant="ghost"
                disabled={!dirty || busy}
                onClick={() => {
                  setDraft(business.settings);
                  setName(business.name);
                  setError('');
                }}
              >
                Discard changes
              </Button>
              <span className="text-sm text-muted-foreground">
                {problems.length > 0
                  ? `Fix ${problems.length} problem${problems.length === 1 ? '' : 's'} to save.`
                  : dirty
                    ? 'Unsaved changes.'
                    : `Version ${business.settingsVersion}.`}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
