import { formatMoney, term } from '@boutique/domain';
import { Button, Input, Label, Notice, Select } from '@boutique/ui';
import { useId, useMemo, useState } from 'react';
import { Barcode } from '../../components/Barcode.tsx';
import { matches, useCatalogue } from '../../lib/catalogue.ts';
import { useBusinessContext } from '../business/BusinessLayout.tsx';

interface Sheet {
  label: string;
  page: string;
  columns: number;
  width: string;
  height: string;
  gap: string;
  margin: string;
}

const SHEETS = {
  a4x24: {
    label: 'A4 sheet, 3 × 8 (70 × 37 mm)',
    page: 'A4',
    columns: 3,
    width: '70mm',
    height: '37mm',
    gap: '0mm',
    margin: '0mm',
  },
  a4x40: {
    label: 'A4 sheet, 4 × 10 (48 × 25 mm)',
    page: 'A4',
    columns: 4,
    width: '48mm',
    height: '25mm',
    gap: '2mm',
    margin: '10mm 8mm',
  },
  roll50: {
    label: 'Label roll, 50 × 25 mm',
    page: '50mm 25mm',
    columns: 1,
    width: '50mm',
    height: '25mm',
    gap: '0mm',
    margin: '0mm',
  },
} satisfies Record<string, Sheet>;
type SheetKey = keyof typeof SHEETS;

export function LabelsPage() {
  const { business } = useBusinessContext();
  const { load } = useCatalogue(business.id);
  const [query, setQuery] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [sheetKey, setSheetKey] = useState<SheetKey>('a4x24');
  const [showPrice, setShowPrice] = useState(true);
  const ids = { search: useId(), sheet: useId() };
  const sheet: Sheet = SHEETS[sheetKey];
  const money = (minor: number) =>
    formatMoney(minor, { currency: business.currency, locale: business.locale });

  const catalogue = load.status === 'ready' ? load.catalogue : null;
  const rows = useMemo(
    () =>
      (catalogue?.products ?? []).flatMap((product) =>
        product.variants.map((variant) => ({ product, variant })),
      ),
    [catalogue],
  );
  const shown = rows.filter(({ product, variant }) => matches(product, variant, query));
  const labels = rows.flatMap((row) =>
    Array.from({ length: counts[row.variant.id] ?? 0 }, (_, i) => ({
      ...row,
      key: `${row.variant.id}-${i}`,
    })),
  );
  const missingCodes = rows.filter((r) => (counts[r.variant.id] ?? 0) > 0 && !r.variant.barcode).length;

  const setCount = (id: string, value: number) =>
    setCounts((current) => ({
      ...current,
      [id]: Math.max(0, Math.min(500, Number.isFinite(value) ? Math.floor(value) : 0)),
    }));

  return (
    <div className="grid gap-5">
      <style>{`
        @media print {
          @page { size: ${sheet.page}; margin: ${sheet.margin}; }
          body * { visibility: hidden; }
          .label-sheet, .label-sheet * { visibility: visible; }
          .label-sheet { position: absolute; inset: 0; }
        }
      `}</style>

      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="grid gap-1">
          <h2 className="text-xl font-semibold">Labels</h2>
          <p className="text-sm text-muted-foreground">Pick how many labels each item needs, then print.</p>
        </div>
        <Button onClick={() => window.print()} disabled={labels.length === 0}>
          Print {labels.length || ''} label{labels.length === 1 ? '' : 's'}
        </Button>
      </div>

      {load.status === 'loading' && <p className="text-sm text-muted-foreground">Loading…</p>}
      {load.status === 'error' && <Notice tone="danger">Could not load the catalogue: {load.message}</Notice>}
      {missingCodes > 0 && (
        <Notice tone="warning" className="print:hidden">
          {missingCodes} chosen item{missingCodes === 1 ? ' has' : 's have'} no barcode. Open the{' '}
          {term(business.settings, 'product').toLowerCase()} and use “Make missing barcodes”, or the label
          prints without one.
        </Notice>
      )}

      {catalogue && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] print:block">
          <section className="grid content-start gap-3 print:hidden">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid min-w-48 flex-1 gap-1.5">
                <Label htmlFor={ids.search}>Search</Label>
                <Input
                  id={ids.search}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={ids.sheet}>Label paper</Label>
                <Select
                  id={ids.sheet}
                  value={sheetKey}
                  onChange={(e) => setSheetKey(e.target.value as SheetKey)}
                >
                  {Object.entries(SHEETS).map(([key, s]) => (
                    <option key={key} value={key}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
                Show price
              </label>
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() =>
                  setCounts(
                    Object.fromEntries(shown.map((r) => [r.variant.id, Math.max(0, r.variant.onHand)])),
                  )
                }
              >
                One per item in stock
              </button>
              <button type="button" className="text-primary hover:underline" onClick={() => setCounts({})}>
                Clear
              </button>
            </div>
            <ul className="grid max-h-[60vh] gap-1 overflow-y-auto rounded-lg border bg-card p-2">
              {shown.map(({ product, variant }) => (
                <li key={variant.id} className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-muted">
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="truncate font-medium">{product.name}</div>
                    <div className="truncate text-muted-foreground">
                      {variant.optionValues.join(' / ') || 'No options'} · {variant.onHand} in stock
                    </div>
                  </div>
                  <label className="sr-only" htmlFor={`count-${variant.id}`}>
                    Labels for {product.name} {variant.optionValues.join(' ')}
                  </label>
                  <Input
                    id={`count-${variant.id}`}
                    className="w-20"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={500}
                    value={counts[variant.id] ?? 0}
                    onChange={(e) => setCount(variant.id, Number(e.target.value))}
                  />
                </li>
              ))}
              {shown.length === 0 && <li className="p-2 text-sm text-muted-foreground">Nothing matches.</li>}
            </ul>
          </section>

          <section className="grid content-start gap-2" aria-label="Preview">
            <h3 className="text-sm font-semibold print:hidden">Preview</h3>
            {labels.length === 0 ? (
              <p className="text-sm text-muted-foreground print:hidden">
                Labels appear here as you pick items.
              </p>
            ) : (
              <div className="overflow-auto rounded-lg border bg-white p-2 print:border-0 print:p-0">
                <div
                  className="label-sheet grid text-black"
                  style={{
                    gridTemplateColumns: `repeat(${sheet.columns}, ${sheet.width})`,
                    gridAutoRows: sheet.height,
                    gap: sheet.gap,
                  }}
                >
                  {labels.map(({ key, product, variant }) => (
                    <div
                      key={key}
                      className="flex flex-col justify-between overflow-hidden px-[2mm] py-[1.5mm] text-[8pt] leading-tight outline outline-1 outline-dashed outline-black/20 print:outline-0"
                      style={{ breakInside: 'avoid' }}
                    >
                      <div className="truncate text-[6.5pt] uppercase tracking-wide">{business.name}</div>
                      <div className="truncate font-semibold">{product.name}</div>
                      <div className="flex justify-between gap-1">
                        <span className="truncate">{variant.optionValues.join(' / ')}</span>
                        {showPrice && (
                          <span className="whitespace-nowrap font-bold">{money(variant.price)}</span>
                        )}
                      </div>
                      {variant.barcode && (
                        <>
                          <Barcode value={variant.barcode} className="h-[7mm] w-full" />
                          <div className="text-center font-mono text-[6.5pt]">{variant.barcode}</div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
