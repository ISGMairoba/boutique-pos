import { formatMoney, priceRange, stockStatus, suggestedCategories, term } from '@boutique/domain';
import { Badge, Button, buttonVariants, Input, Notice, Select } from '@boutique/ui';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { matches, type Product, useCatalogue } from '../../lib/catalogue.ts';
import { errorMessage, supabase } from '../../lib/supabase.ts';
import { useBusinessContext } from '../business/BusinessLayout.tsx';

export function CataloguePage() {
  const { business } = useBusinessContext();
  const { settings } = business;
  const [showArchived, setShowArchived] = useState(false);
  const { load, reload } = useCatalogue(business.id, showArchived);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const searchId = useId();
  const categoryId = useId();
  const newCategoryId = useId();
  const canEdit = (business.rank ?? 0) >= 3;
  const money = (minor: number) =>
    formatMoney(minor, { currency: business.currency, locale: business.locale });
  const products = term(settings, 'products');

  const catalogue = load.status === 'ready' ? load.catalogue : null;
  const categoryName = useMemo(
    () => new Map((catalogue?.categories ?? []).map((c) => [c.id, c.name])),
    [catalogue],
  );
  const shown = useMemo(
    () =>
      (catalogue?.products ?? []).filter(
        (product) =>
          (!category || (category === 'none' ? !product.categoryId : product.categoryId === category)) &&
          matches(product, null, query),
      ),
    [catalogue, category, query],
  );
  const suggestions = suggestedCategories(settings.catalogueSeed).filter(
    (name) => !(catalogue?.categories ?? []).some((c) => c.name.toLowerCase() === name.toLowerCase()),
  );

  async function addCategories(names: string[]) {
    if (!supabase || names.length === 0) return;
    setBusy(true);
    setError('');
    const start = catalogue?.categories.length ?? 0;
    for (const [index, name] of names.entries()) {
      const { error: saveError } = await supabase.rpc('save_category', {
        p_business: business.id,
        p_id: crypto.randomUUID(),
        p_name: name,
        p_sort: start + index,
      });
      if (saveError) {
        setError(errorMessage(saveError));
        break;
      }
    }
    setBusy(false);
    setNewCategory('');
    await reload();
  }

  async function archiveCategory(id: string, name: string, sort: number) {
    if (!supabase) return;
    setBusy(true);
    const { error: saveError } = await supabase.rpc('save_category', {
      p_business: business.id,
      p_id: id,
      p_name: name,
      p_sort: sort,
      p_archived: true,
    });
    setBusy(false);
    if (saveError) setError(errorMessage(saveError));
    if (category === id) setCategory('');
    await reload();
  }

  const stockSummary = (product: Product) => {
    const total = product.variants.reduce((sum, v) => sum + v.onHand, 0);
    const out = product.variants.filter((v) => stockStatus(v.onHand, v.lowStockAt) === 'out').length;
    const low = product.variants.filter((v) => stockStatus(v.onHand, v.lowStockAt) === 'low').length;
    return { total, out, low };
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-xl font-semibold">{products}</h2>
          <p className="text-sm text-muted-foreground">
            {catalogue
              ? `${catalogue.products.filter((p) => !p.archived).length} ${products.toLowerCase()}, ${catalogue.products.reduce((n, p) => n + p.variants.length, 0)} variants`
              : 'Everything the shop sells.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/b/${business.id}/labels`} className={buttonVariants({ variant: 'outline' })}>
            Print labels
          </Link>
          {canEdit && (
            <Link to={`/b/${business.id}/catalogue/new`} className={buttonVariants()}>
              New {term(settings, 'product').toLowerCase()}
            </Link>
          )}
        </div>
      </div>

      {load.status === 'loading' && (
        <p className="text-sm text-muted-foreground">Loading {products.toLowerCase()}…</p>
      )}
      {load.status === 'error' && <Notice tone="danger">Could not load the catalogue: {load.message}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}

      {catalogue && (
        <>
          <section className="grid gap-3 rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold">{term(settings, 'categories')}</h3>
            {catalogue.categories.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No {term(settings, 'categories').toLowerCase()} yet.
              </p>
            )}
            <ul className="flex flex-wrap gap-2">
              {catalogue.categories.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-1 rounded-full border bg-background py-1 pl-3 pr-1 text-sm"
                >
                  {c.name}
                  {canEdit && (
                    <button
                      type="button"
                      className="rounded-full px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Remove ${c.name}`}
                      disabled={busy}
                      onClick={() => void archiveCategory(c.id, c.name, c.sort)}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={newCategoryId} className="sr-only">
                  New {term(settings, 'category').toLowerCase()}
                </label>
                <Input
                  id={newCategoryId}
                  className="max-w-xs"
                  maxLength={60}
                  placeholder={`New ${term(settings, 'category').toLowerCase()}`}
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newCategory.trim()) void addCategories([newCategory.trim()]);
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !newCategory.trim()}
                  onClick={() => void addCategories([newCategory.trim()])}
                >
                  Add
                </Button>
                {suggestions.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void addCategories(suggestions)}
                  >
                    Add suggested: {suggestions.slice(0, 3).join(', ')}
                    {suggestions.length > 3 ? '…' : ''}
                  </Button>
                )}
              </div>
            )}
          </section>

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
            <div className="grid w-48 gap-1.5">
              <label htmlFor={categoryId} className="text-sm font-medium">
                {term(settings, 'category')}
              </label>
              <Select id={categoryId} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All</option>
                {catalogue.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="none">Not in a {term(settings, 'category').toLowerCase()}</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show archived
            </label>
          </div>

          {catalogue.products.length === 0 ? (
            <Notice>
              No {products.toLowerCase()} yet.{' '}
              {canEdit
                ? `Add the first with New ${term(settings, 'product').toLowerCase()}.`
                : 'A Manager adds them.'}
            </Notice>
          ) : shown.length === 0 ? (
            <Notice>
              Nothing matches. Try another search or {term(settings, 'category').toLowerCase()}.
            </Notice>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">{term(settings, 'product')}</th>
                    <th className="px-4 py-2.5 font-semibold">{term(settings, 'category')}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Price</th>
                    <th className="px-4 py-2.5 text-right font-semibold">In stock</th>
                    <th className="px-4 py-2.5 font-semibold">Attention</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((product) => {
                    const range = priceRange(product.variants.map((v) => v.price));
                    const stock = stockSummary(product);
                    return (
                      <tr key={product.id} className="border-t align-top">
                        <td className="px-4 py-3">
                          <Link
                            to={`/b/${business.id}/catalogue/${product.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {product.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {product.options.length
                              ? product.options
                                  .map((o) => `${o.values.length} ${o.name.toLowerCase()}`)
                                  .join(' × ')
                              : 'No options'}
                            {product.archived && ' · archived'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {product.categoryId ? (categoryName.get(product.categoryId) ?? '—') : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {range
                            ? range.min === range.max
                              ? money(range.min)
                              : `${money(range.min)} – ${money(range.max)}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{stock.total}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {stock.out > 0 && <Badge tone="danger">{stock.out} out</Badge>}
                            {stock.low > 0 && <Badge tone="warning">{stock.low} low</Badge>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
