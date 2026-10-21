import type { ProductOption } from '@boutique/domain';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage, supabase } from './supabase.ts';

export interface Category {
  id: string;
  name: string;
  sort: number;
}

export interface Variant {
  id: string;
  productId: string;
  optionValues: string[];
  sku: string | null;
  barcode: string | null;
  price: number;
  cost: number | null;
  lowStockAt: number | null;
  onHand: number;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string | null;
  options: ProductOption[];
  archived: boolean;
  version: number;
  variants: Variant[];
}

export interface Batch {
  id: string;
  variantId: string;
  batchNo: string;
  expiresOn: string | null;
  onHand: number;
}

export interface Catalogue {
  categories: Category[];
  products: Product[];
  batches: Batch[];
}

const PAGE = 1000;

/** Reads every row of a query, a page at a time (the server returns at most 1000 rows per call). */
async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

function parseOptions(value: unknown): ProductOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (typeof option !== 'object' || option === null) return [];
    const { name, values } = option as { name?: unknown; values?: unknown };
    if (typeof name !== 'string' || !Array.isArray(values)) return [];
    return [{ name, values: values.filter((v): v is string => typeof v === 'string') }];
  });
}

export async function loadCatalogue(businessId: string, includeArchived = false): Promise<Catalogue> {
  if (!supabase) throw new Error('This build has no server configured.');
  const client = supabase;
  const [categories, products, variants, batches] = await Promise.all([
    readAll((from, to) =>
      client
        .from('categories')
        .select('id, name, sort')
        .eq('business_id', businessId)
        .eq('archived', false)
        .order('sort')
        .order('name')
        .range(from, to),
    ),
    readAll((from, to) => {
      let query = client
        .from('products')
        .select('id, name, category_id, options, archived, version')
        .eq('business_id', businessId);
      if (!includeArchived) query = query.eq('archived', false);
      return query.order('name').range(from, to);
    }),
    readAll((from, to) =>
      client
        .from('variants')
        .select('id, product_id, option_values, sku, barcode, price, cost, low_stock_at, on_hand')
        .eq('business_id', businessId)
        .eq('archived', false)
        .order('id')
        .range(from, to),
    ),
    readAll((from, to) =>
      client
        .from('batches')
        .select('id, variant_id, batch_no, expires_on, on_hand')
        .eq('business_id', businessId)
        .neq('on_hand', 0)
        .order('expires_on', { nullsFirst: false })
        .range(from, to),
    ),
  ]);

  const byProduct = new Map<string, Variant[]>();
  for (const row of variants) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push({
      id: row.id,
      productId: row.product_id,
      optionValues: row.option_values,
      sku: row.sku,
      barcode: row.barcode,
      price: row.price,
      cost: row.cost,
      lowStockAt: row.low_stock_at,
      onHand: row.on_hand,
    });
    byProduct.set(row.product_id, list);
  }

  return {
    categories,
    products: products.map((row) => {
      const options = parseOptions(row.options);
      // Show variants in the order of the product's option values.
      const order = (values: string[]) =>
        values
          .map((value, i) => (options[i]?.values.indexOf(value) ?? 0).toString().padStart(3, '0'))
          .join('');
      return {
        id: row.id,
        name: row.name,
        categoryId: row.category_id,
        options,
        archived: row.archived,
        version: row.version,
        variants: (byProduct.get(row.id) ?? []).sort((a, b) =>
          order(a.optionValues).localeCompare(order(b.optionValues)),
        ),
      };
    }),
    batches: batches.map((row) => ({
      id: row.id,
      variantId: row.variant_id,
      batchNo: row.batch_no,
      expiresOn: row.expires_on,
      onHand: row.on_hand,
    })),
  };
}

export type CatalogueLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; catalogue: Catalogue };

export function useCatalogue(businessId: string, includeArchived = false) {
  const [load, setLoad] = useState<CatalogueLoad>({ status: 'loading' });
  const reload = useCallback(async () => {
    try {
      const catalogue = await loadCatalogue(businessId, includeArchived);
      setLoad({ status: 'ready', catalogue });
    } catch (failure) {
      setLoad({ status: 'error', message: errorMessage(failure) });
    }
  }, [businessId, includeArchived]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { load, reload };
}

/** Text that matches a product or variant in search: name, option values, SKU and barcode. */
export function matches(product: Product, variant: Variant | null, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const fields = [
    product.name,
    ...(variant ? [...variant.optionValues, variant.sku ?? '', variant.barcode ?? ''] : []),
  ];
  if (!variant) {
    for (const v of product.variants) fields.push(v.sku ?? '', v.barcode ?? '', ...v.optionValues);
  }
  return q.split(/\s+/).every((word) => fields.some((field) => field.toLowerCase().includes(word)));
}
