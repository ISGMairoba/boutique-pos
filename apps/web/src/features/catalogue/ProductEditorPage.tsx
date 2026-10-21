import {
  CATALOGUE_LIMITS,
  internalBarcode,
  type ProductDraft,
  type ProductOption,
  suggestedOptions,
  syncVariants,
  term,
  type VariantDraft,
  validateProduct,
} from '@boutique/domain';
import { Button, cn, FieldHint, Input, Label, Notice, Select } from '@boutique/ui';
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { MoneyInput } from '../../components/MoneyInput.tsx';
import { useCatalogue } from '../../lib/catalogue.ts';
import { errorMessage, supabase } from '../../lib/supabase.ts';
import { useBusinessContext } from '../business/BusinessLayout.tsx';

const EMPTY_PRICE = -1;
const template = { sku: '', barcode: '', price: EMPTY_PRICE, cost: null, lowStockAt: null };

function OptionEditor({
  option,
  index,
  disabled,
  onChange,
  onRemove,
}: {
  option: ProductOption;
  index: number;
  disabled: boolean;
  onChange: (option: ProductOption) => void;
  onRemove: () => void;
}) {
  const nameId = useId();
  const valueId = useId();
  const [text, setText] = useState('');
  const add = () => {
    const values = text
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .filter((v) => !option.values.some((existing) => existing.toLowerCase() === v.toLowerCase()));
    if (values.length) onChange({ ...option, values: [...option.values, ...values] });
    setText('');
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add();
    }
  };
  return (
    <div className="grid gap-3 rounded-md border bg-surface p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-40 flex-1 gap-1.5">
          <Label htmlFor={nameId}>Option {index + 1}</Label>
          <Input
            id={nameId}
            maxLength={CATALOGUE_LIMITS.optionNameLength}
            placeholder="Size, Colour, Shade…"
            disabled={disabled}
            value={option.name}
            onChange={(e) => onChange({ ...option, name: e.target.value })}
          />
        </div>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onRemove}>
          Remove option
        </Button>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {option.values.map((value) => (
          <li
            key={value}
            className="flex items-center gap-1 rounded-full border bg-background py-0.5 pl-2.5 pr-1 text-sm"
          >
            {value}
            <button
              type="button"
              disabled={disabled}
              aria-label={`Remove ${value}`}
              className="rounded-full px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onChange({ ...option, values: option.values.filter((v) => v !== value) })}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <label htmlFor={valueId} className="sr-only">
          Add values to {option.name || `option ${index + 1}`}
        </label>
        <Input
          id={valueId}
          className="max-w-xs"
          placeholder="Type a value and press Enter"
          disabled={disabled}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onBlur={add}
        />
      </div>
    </div>
  );
}

export function ProductEditorPage() {
  const { business } = useBusinessContext();
  const { productId } = useParams();
  const navigate = useNavigate();
  const { load } = useCatalogue(business.id, true);
  const isNew = !productId;
  const canEdit = (business.rank ?? 0) >= 3;
  const { settings, currency, locale } = business;
  const ids = { name: useId(), category: useId() };

  const [draft, setDraft] = useState<ProductDraft | null>(() =>
    isNew
      ? {
          id: crypto.randomUUID(),
          name: '',
          categoryId: null,
          options: [],
          variants: syncVariants([], [], template, () => crypto.randomUUID()),
        }
      : null,
  );
  const [version, setVersion] = useState<number | null>(null);
  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showProblems, setShowProblems] = useState(false);

  const catalogue = load.status === 'ready' ? load.catalogue : null;
  const existing = catalogue?.products.find((p) => p.id === productId) ?? null;

  useEffect(() => {
    if (isNew || !existing || draft) return;
    setDraft({
      id: existing.id,
      name: existing.name,
      categoryId: existing.categoryId,
      options: existing.options,
      variants: existing.variants.map((v) => ({
        id: v.id,
        optionValues: v.optionValues,
        sku: v.sku ?? '',
        barcode: v.barcode ?? '',
        price: v.price,
        cost: v.cost,
        lowStockAt: v.lowStockAt,
      })),
    });
    setVersion(existing.version);
    setArchived(existing.archived);
  }, [isNew, existing, draft]);

  const problems = useMemo(() => (draft ? validateProduct(draft) : []), [draft]);
  const suggestions = suggestedOptions(settings.catalogueSeed).filter(
    (s) => !draft?.options.some((o) => o.name.toLowerCase() === s.name.toLowerCase()),
  );

  if (!isNew && load.status === 'loading') return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!isNew && load.status === 'error') return <Notice tone="danger">{load.message}</Notice>;
  if (!isNew && !existing)
    return <Notice tone="danger">This {term(settings, 'product').toLowerCase()} was not found.</Notice>;
  if (!draft) return null;

  const setOptions = (options: ProductOption[]) => {
    setDraft((current) => {
      if (!current) return current;
      const first = current.variants[0];
      const base = first
        ? { ...template, price: first.price, cost: first.cost, lowStockAt: first.lowStockAt }
        : template;
      // A new combination needs a value in every option; until then keep the variants as they are.
      const complete = options.every((o) => o.values.length > 0);
      return {
        ...current,
        options,
        variants: complete
          ? syncVariants(options, current.variants, base, () => crypto.randomUUID())
          : current.variants,
      };
    });
  };
  const setVariant = (index: number, change: Partial<VariantDraft>) =>
    setDraft((current) =>
      current
        ? { ...current, variants: current.variants.map((v, i) => (i === index ? { ...v, ...change } : v)) }
        : current,
    );
  const disabled = !canEdit || busy;

  async function save() {
    if (!supabase || !draft) return;
    setShowProblems(true);
    if (problems.length) return;
    setBusy(true);
    setError('');
    const { data, error: saveError } = await supabase.rpc('save_product', {
      p_business: business.id,
      p_product: {
        id: draft.id,
        name: draft.name.trim(),
        categoryId: draft.categoryId,
        options: draft.options.map((o) => ({ name: o.name.trim(), values: o.values.map((v) => v.trim()) })),
        version,
      },
      p_variants: draft.variants.map((v) => ({
        id: v.id,
        optionValues: v.optionValues,
        sku: v.sku.trim(),
        barcode: v.barcode.trim(),
        price: v.price,
        cost: v.cost,
        lowStockAt: v.lowStockAt,
      })),
    });
    setBusy(false);
    if (saveError) {
      setError(errorMessage(saveError));
      return;
    }
    setVersion(data);
    navigate(`/b/${business.id}/catalogue`);
  }

  async function setArchive(next: boolean) {
    if (!supabase || !draft) return;
    setBusy(true);
    setError('');
    const { error: archiveError } = await supabase.rpc('archive_product', {
      p_business: business.id,
      p_product: draft.id,
      p_archived: next,
    });
    setBusy(false);
    if (archiveError) {
      setError(errorMessage(archiveError));
      return;
    }
    navigate(`/b/${business.id}/catalogue`);
  }

  const optionsComplete = draft.options.every((o) => o.values.length > 0);

  return (
    <div className="grid gap-5">
      <Link
        to={`/b/${business.id}/catalogue`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← {term(settings, 'products')}
      </Link>
      <h2 className="text-xl font-semibold">
        {isNew ? `New ${term(settings, 'product').toLowerCase()}` : existing?.name}
        {archived && <span className="ml-2 text-sm font-normal text-muted-foreground">(archived)</span>}
      </h2>
      {!canEdit && <Notice>Only a Manager can change {term(settings, 'products').toLowerCase()}.</Notice>}

      <section className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={ids.name}>Name</Label>
          <Input
            id={ids.name}
            maxLength={CATALOGUE_LIMITS.nameLength}
            disabled={disabled}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={ids.category}>{term(settings, 'category')}</Label>
          <Select
            id={ids.category}
            disabled={disabled}
            value={draft.categoryId ?? ''}
            onChange={(e) => setDraft({ ...draft, categoryId: e.target.value || null })}
          >
            <option value="">None</option>
            {catalogue?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="grid gap-1">
          <h3 className="font-semibold">Options</h3>
          <p className="text-sm text-muted-foreground">
            Sizes, colours or shades. Every combination becomes a variant with its own price, barcode and
            stock.
          </p>
        </div>
        {draft.options.map((option, index) => (
          <OptionEditor
            // Options are edited in place; their position is their identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above.
            key={index}
            option={option}
            index={index}
            disabled={disabled}
            onChange={(next) => setOptions(draft.options.map((o, i) => (i === index ? next : o)))}
            onRemove={() => setOptions(draft.options.filter((_, i) => i !== index))}
          />
        ))}
        {draft.options.length < CATALOGUE_LIMITS.options && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <Button
                key={s.name}
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => setOptions([...draft.options, { name: s.name, values: s.values }])}
              >
                Add {s.name}
                {s.values.length
                  ? ` (${s.values.slice(0, 4).join(', ')}${s.values.length > 4 ? '…' : ''})`
                  : ''}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => setOptions([...draft.options, { name: '', values: [] }])}
            >
              Add another option
            </Button>
          </div>
        )}
        {!optionsComplete && (
          <FieldHint>Give every option at least one value to update the variants below.</FieldHint>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="grid gap-1">
            <h3 className="font-semibold">Variants ({draft.variants.length})</h3>
            <p className="text-sm text-muted-foreground">
              Leave the barcode empty to scan the supplier's one later, or make one for items without.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={
                disabled || draft.variants.length < 2 || (draft.variants[0]?.price ?? EMPTY_PRICE) < 0
              }
              onClick={() => {
                const first = draft.variants[0];
                if (!first) return;
                setDraft({
                  ...draft,
                  variants: draft.variants.map((v) => ({
                    ...v,
                    price: first.price,
                    cost: first.cost,
                    lowStockAt: first.lowStockAt,
                  })),
                });
              }}
            >
              Use the first row for all
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || draft.variants.every((v) => v.barcode.trim())}
              onClick={() =>
                setDraft({
                  ...draft,
                  variants: draft.variants.map((v) =>
                    v.barcode.trim() ? v : { ...v, barcode: internalBarcode() },
                  ),
                })
              }
            >
              Make missing barcodes
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Variant</th>
                <th className="px-3 py-2 font-semibold">Price</th>
                <th className="px-3 py-2 font-semibold">Cost</th>
                <th className="px-3 py-2 font-semibold">Barcode</th>
                <th className="px-3 py-2 font-semibold">SKU</th>
                <th className="px-3 py-2 font-semibold">Low at</th>
              </tr>
            </thead>
            <tbody>
              {draft.variants.map((variant, index) => {
                const label = variant.optionValues.join(' / ') || draft.name || 'This item';
                const rowProblem =
                  showProblems && problems.some((p) => p.path.startsWith(`variants.${index}`));
                return (
                  <tr key={variant.id} className={cn('border-t', rowProblem && 'bg-destructive-soft')}>
                    <td className="px-3 py-2 font-medium">{label}</td>
                    <td className="w-36 px-3 py-2">
                      <MoneyInput
                        aria-label={`Price of ${label}`}
                        currency={currency}
                        locale={locale}
                        disabled={disabled}
                        value={variant.price < 0 ? null : variant.price}
                        onChange={(value) => setVariant(index, { price: value ?? EMPTY_PRICE })}
                      />
                    </td>
                    <td className="w-36 px-3 py-2">
                      <MoneyInput
                        aria-label={`Cost of ${label}`}
                        currency={currency}
                        locale={locale}
                        allowEmpty
                        disabled={disabled}
                        value={variant.cost}
                        onChange={(value) => setVariant(index, { cost: value })}
                      />
                    </td>
                    <td className="w-48 px-3 py-2">
                      <Input
                        aria-label={`Barcode of ${label}`}
                        className="font-mono"
                        maxLength={32}
                        disabled={disabled}
                        value={variant.barcode}
                        onChange={(e) => setVariant(index, { barcode: e.target.value.trim() })}
                      />
                    </td>
                    <td className="w-36 px-3 py-2">
                      <Input
                        aria-label={`SKU of ${label}`}
                        maxLength={32}
                        disabled={disabled}
                        value={variant.sku}
                        onChange={(e) => setVariant(index, { sku: e.target.value.trim() })}
                      />
                    </td>
                    <td className="w-24 px-3 py-2">
                      <Input
                        aria-label={`Low-stock level of ${label}`}
                        type="number"
                        min={0}
                        disabled={disabled}
                        value={variant.lowStockAt ?? ''}
                        onChange={(e) =>
                          setVariant(index, {
                            lowStockAt: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {showProblems && problems.length > 0 && (
        <Notice tone="danger">
          <ul className="grid gap-1">
            {[...new Set(problems.map((p) => p.message))].slice(0, 8).map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={save} disabled={busy || !optionsComplete}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Link to={`/b/${business.id}/catalogue`} className="inline-flex h-12 items-center px-4 text-sm">
            Cancel
          </Link>
          {!isNew && (
            <Button
              variant="ghost"
              size="lg"
              className="ml-auto"
              disabled={busy}
              onClick={() => void setArchive(!archived)}
            >
              {archived ? 'Bring back' : 'Archive'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
