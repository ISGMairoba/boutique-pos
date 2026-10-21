import {
  businessDate,
  daysUntil,
  expiryStatus,
  stockChange,
  stockStatus,
  term,
  variantLabel,
} from '@boutique/domain';
import { Badge, Button, cn, FieldHint, Input, Label, Notice, Select } from '@boutique/ui';
import { useEffect, useId, useMemo, useState } from 'react';
import { type Catalogue, matches, type Product, useCatalogue, type Variant } from '../../lib/catalogue.ts';
import { errorMessage, supabase } from '../../lib/supabase.ts';
import { useBusinessContext } from '../business/BusinessLayout.tsx';
import { formatDate, formatDateTime } from '../licence/labels.ts';

type Filter = 'all' | 'low' | 'out' | 'expiring';
type ChangeKind = 'adjust' | 'damage' | 'count';

interface Movement {
  id: string;
  reason: string;
  qty: number;
  on_hand_after: number;
  note: string | null;
  happened_at: string;
}

const REASON_LABEL: Record<string, string> = {
  receive: 'Received',
  adjust: 'Adjusted',
  count: 'Counted',
  damage: 'Damaged or lost',
  return: 'Returned',
  sale: 'Sold',
};

function StockBadge({ variant }: { variant: Variant }) {
  const status = stockStatus(variant.onHand, variant.lowStockAt);
  if (status === 'out') return <Badge tone="danger">{variant.onHand < 0 ? 'Below zero' : 'Out'}</Badge>;
  if (status === 'low') return <Badge tone="warning">Low</Badge>;
  return null;
}

function ReceivePanel({
  catalogue,
  businessId,
  batches,
  onDone,
  onCancel,
}: {
  catalogue: Catalogue;
  businessId: string;
  batches: boolean;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const ids = { product: useId(), batch: useId(), expires: useId(), note: useId() };
  const [productId, setProductId] = useState(catalogue.products[0]?.id ?? '');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [batchNo, setBatchNo] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const product = catalogue.products.find((p) => p.id === productId);
  const lines = (product?.variants ?? [])
    .map((v) => ({ variant: v, qty: Number(quantities[v.id] ?? '') }))
    .filter((line) => Number.isInteger(line.qty) && line.qty > 0);
  const total = lines.reduce((sum, line) => sum + line.qty, 0);

  async function save() {
    if (!supabase || !product || lines.length === 0) return;
    setBusy(true);
    setError('');
    const at = new Date().toISOString();
    const { error: saveError } = await supabase.rpc('record_stock', {
      p_business: businessId,
      p_movements: lines.map((line) => ({
        id: crypto.randomUUID(),
        variantId: line.variant.id,
        kind: 'receive',
        quantity: line.qty,
        batch: batchNo.trim() ? { number: batchNo.trim(), expiresOn: expiresOn || null } : null,
        note: note.trim(),
        happenedAt: at,
      })),
    });
    setBusy(false);
    if (saveError) {
      setError(errorMessage(saveError));
      return;
    }
    onDone(`Received ${total} of ${product.name}.`);
  }

  return (
    <section className="grid gap-4 rounded-lg border bg-card p-4">
      <h3 className="font-semibold">Receive stock</h3>
      <div className="grid max-w-md gap-1.5">
        <Label htmlFor={ids.product}>What arrived</Label>
        <Select
          id={ids.product}
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            setQuantities({});
          }}
        >
          {catalogue.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
      {product && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
          {product.variants.map((v) => (
            <div key={v.id} className="grid gap-1">
              <Label htmlFor={`${ids.product}-${v.id}`} className="truncate">
                {v.optionValues.join(' / ') || product.name}
              </Label>
              <Input
                id={`${ids.product}-${v.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="0"
                value={quantities[v.id] ?? ''}
                onChange={(e) => setQuantities({ ...quantities, [v.id]: e.target.value })}
              />
              <span className="text-xs text-muted-foreground">Now {v.onHand}</span>
            </div>
          ))}
        </div>
      )}
      {batches && (
        <div className="grid max-w-md gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={ids.batch}>Batch number</Label>
            <Input
              id={ids.batch}
              maxLength={40}
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={ids.expires}>Expires on</Label>
            <Input
              id={ids.expires}
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
            />
          </div>
          <FieldHint className="sm:col-span-2">Leave both empty for goods without a batch.</FieldHint>
        </div>
      )}
      <div className="grid max-w-md gap-1.5">
        <Label htmlFor={ids.note}>Note (optional)</Label>
        <Input
          id={ids.note}
          maxLength={200}
          placeholder="Supplier, invoice number"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={busy || lines.length === 0}>
          {busy ? 'Saving…' : total ? `Receive ${total}` : 'Receive'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

function ChangePanel({
  businessId,
  product,
  variant,
  onDone,
  onCancel,
}: {
  businessId: string;
  product: Product;
  variant: Variant;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const ids = { kind: useId(), qty: useId(), note: useId() };
  const [kind, setKind] = useState<ChangeKind>('damage');
  const [entered, setEntered] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const label = variantLabel(product.name, variant.optionValues);

  let preview = '';
  let change: number | null = null;
  if (entered.trim() !== '') {
    try {
      change = stockChange(kind, Number(entered), variant.onHand);
      preview = `${variant.onHand} → ${variant.onHand + change}`;
    } catch (failure) {
      preview = errorMessage(failure);
    }
  }

  async function save() {
    if (!supabase || change === null) return;
    setBusy(true);
    setError('');
    const amount = Number(entered);
    const { error: saveError } = await supabase.rpc('record_stock', {
      p_business: businessId,
      p_movements: [
        {
          id: crypto.randomUUID(),
          variantId: variant.id,
          kind,
          ...(kind === 'count' ? { counted: amount } : { quantity: amount }),
          note: note.trim(),
          happenedAt: new Date().toISOString(),
        },
      ],
    });
    setBusy(false);
    if (saveError) {
      setError(errorMessage(saveError));
      return;
    }
    onDone(`${label}: ${preview}.`);
  }

  return (
    <div className="grid gap-3 rounded-md border bg-surface p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={ids.kind}>Change</Label>
          <Select id={ids.kind} value={kind} onChange={(e) => setKind(e.target.value as ChangeKind)}>
            <option value="damage">Damaged or lost</option>
            <option value="count">Counted on the shelf</option>
            <option value="adjust">Other correction (+ or −)</option>
          </Select>
        </div>
        <div className="grid w-32 gap-1.5">
          <Label htmlFor={ids.qty}>
            {kind === 'count' ? 'Counted' : kind === 'damage' ? 'How many' : 'Change by'}
          </Label>
          <Input
            id={ids.qty}
            type="number"
            inputMode="numeric"
            value={entered}
            onChange={(e) => setEntered(e.target.value)}
          />
        </div>
        <div className="grid min-w-48 flex-1 gap-1.5">
          <Label htmlFor={ids.note}>Reason</Label>
          <Input id={ids.note} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {preview && (
        <p className={cn('text-sm', change === null ? 'text-destructive' : 'text-muted-foreground')}>
          {preview}
        </p>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy || change === null}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function History({ variantId, locale, timeZone }: { variantId: string; locale: string; timeZone: string }) {
  const [rows, setRows] = useState<Movement[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    supabase
      ?.from('stock_movements')
      .select('id, reason, qty, on_hand_after, note, happened_at')
      .eq('variant_id', variantId)
      .order('happened_at', { ascending: false })
      .limit(50)
      .then(({ data, error: loadError }) => {
        if (!live) return;
        if (loadError) setError(errorMessage(loadError));
        setRows(data ?? []);
      });
    return () => {
      live = false;
    };
  }, [variantId]);
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!rows) return <p className="text-sm text-muted-foreground">Loading history…</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No stock changes yet.</p>;
  return (
    <ol className="grid gap-1 text-sm">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap justify-between gap-2">
          <span>
            {REASON_LABEL[row.reason] ?? row.reason}{' '}
            <span className="tabular-nums">{row.qty > 0 ? `+${row.qty}` : row.qty}</span>
            <span className="text-muted-foreground"> → {row.on_hand_after}</span>
            {row.note && <span className="text-muted-foreground"> · {row.note}</span>}
          </span>
          <span className="text-muted-foreground">{formatDateTime(row.happened_at, locale, timeZone)}</span>
        </li>
      ))}
    </ol>
  );
}

export function StockPage() {
  const { business } = useBusinessContext();
  const { load, reload } = useCatalogue(business.id);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [receiving, setReceiving] = useState(false);
  const [changing, setChanging] = useState<string | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [done, setDone] = useState('');
  const searchId = useId();
  const canChange = (business.rank ?? 0) >= 2;
  const { settings, locale, timeZone } = business;
  const batchesOn = settings.features.batches === true;
  const today = businessDate(new Date(), timeZone);

  const catalogue = load.status === 'ready' ? load.catalogue : null;
  const rows = useMemo(
    () =>
      (catalogue?.products ?? []).flatMap((product) =>
        product.variants.map((variant) => ({ product, variant })),
      ),
    [catalogue],
  );
  const expiring = (catalogue?.batches ?? []).filter(
    (b) => b.onHand > 0 && expiryStatus(today, b.expiresOn) !== 'ok',
  );
  const expiringVariants = new Set(expiring.map((b) => b.variantId));
  const counts = {
    low: rows.filter((r) => stockStatus(r.variant.onHand, r.variant.lowStockAt) === 'low').length,
    out: rows.filter((r) => stockStatus(r.variant.onHand, r.variant.lowStockAt) === 'out').length,
  };
  const shown = rows.filter(({ product, variant }) => {
    if (!matches(product, variant, query)) return false;
    if (filter === 'low') return stockStatus(variant.onHand, variant.lowStockAt) === 'low';
    if (filter === 'out') return stockStatus(variant.onHand, variant.lowStockAt) === 'out';
    if (filter === 'expiring') return expiringVariants.has(variant.id);
    return true;
  });
  const variantById = new Map(rows.map((r) => [r.variant.id, r]));

  const finish = async (message: string) => {
    setDone(message);
    setReceiving(false);
    setChanging(null);
    await reload();
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-xl font-semibold">Stock</h2>
          <p className="text-sm text-muted-foreground">
            {catalogue ? `${counts.out} out of stock, ${counts.low} running low` : 'What is on the shelves.'}
          </p>
        </div>
        {canChange && catalogue && catalogue.products.length > 0 && !receiving && (
          <Button onClick={() => setReceiving(true)}>Receive stock</Button>
        )}
      </div>

      {load.status === 'loading' && <p className="text-sm text-muted-foreground">Loading stock…</p>}
      {load.status === 'error' && <Notice tone="danger">Could not load stock: {load.message}</Notice>}
      {done && <Notice tone="success">{done}</Notice>}
      {!canChange && <Notice>Only an Admin or Manager can change stock.</Notice>}

      {catalogue && receiving && (
        <ReceivePanel
          catalogue={catalogue}
          businessId={business.id}
          batches={batchesOn}
          onDone={(message) => void finish(message)}
          onCancel={() => setReceiving(false)}
        />
      )}

      {expiring.length > 0 && (
        <Notice tone="warning">
          <p className="font-medium">Expiring stock</p>
          <ul className="mt-1 grid gap-0.5">
            {expiring.slice(0, 8).map((b) => {
              const row = variantById.get(b.variantId);
              const days = b.expiresOn ? daysUntil(today, b.expiresOn) : 0;
              return (
                <li key={b.id}>
                  {row ? variantLabel(row.product.name, row.variant.optionValues) : 'Item'} · batch{' '}
                  {b.batchNo} · {b.onHand}{' '}
                  {days < 0 ? 'expired' : days === 0 ? 'expires today' : `expire in ${days} days`} (
                  {b.expiresOn ? formatDate(`${b.expiresOn}T12:00:00Z`, locale, timeZone) : ''})
                </li>
              );
            })}
          </ul>
        </Notice>
      )}

      {catalogue && catalogue.products.length === 0 && (
        <Notice>
          Add {term(settings, 'products').toLowerCase()} to the catalogue before receiving stock.
        </Notice>
      )}

      {catalogue && catalogue.products.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-56 flex-1 gap-1.5">
              <label htmlFor={searchId} className="text-sm font-medium">
                Search
              </label>
              <Input
                id={searchId}
                type="search"
                placeholder="Name, size, colour, SKU or barcode"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <fieldset className="flex flex-wrap gap-1">
              <legend className="sr-only">Show</legend>
              {(
                [
                  ['all', 'All'],
                  ['low', `Low (${counts.low})`],
                  ['out', `Out (${counts.out})`],
                  ...(batchesOn || expiring.length
                    ? [['expiring', `Expiring (${expiringVariants.size})`]]
                    : []),
                ] as [Filter, string][]
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={filter === value ? 'default' : 'outline'}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </fieldset>
          </div>

          <ul className="grid gap-2">
            {shown.map(({ product, variant }) => (
              <li key={variant.id} className="grid gap-3 rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{product.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {variant.optionValues.join(' / ') || 'No options'}
                      {variant.barcode && <span className="font-mono"> · {variant.barcode}</span>}
                    </div>
                  </div>
                  <StockBadge variant={variant} />
                  <div className="w-16 text-right text-lg font-semibold tabular-nums">{variant.onHand}</div>
                  <div className="flex gap-1">
                    {canChange && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setChanging(changing === variant.id ? null : variant.id)}
                      >
                        Change
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setHistory(history === variant.id ? null : variant.id)}
                    >
                      History
                    </Button>
                  </div>
                </div>
                {changing === variant.id && (
                  <ChangePanel
                    businessId={business.id}
                    product={product}
                    variant={variant}
                    onDone={(message) => void finish(message)}
                    onCancel={() => setChanging(null)}
                  />
                )}
                {history === variant.id && (
                  <History variantId={variant.id} locale={locale} timeZone={timeZone} />
                )}
              </li>
            ))}
          </ul>
          {shown.length === 0 && <Notice>Nothing to show here.</Notice>}
        </>
      )}
    </div>
  );
}
