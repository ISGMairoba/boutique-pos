import { type BusinessSettings, parseSettings } from '@boutique/domain';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage, supabase } from './supabase.ts';

export interface Business {
  id: string;
  name: string;
  preset: string;
  currency: string;
  locale: string;
  timeZone: string;
  receiptPrefix: string;
  settings: BusinessSettings;
  /** The settings exactly as stored, so a save can leave untouched parts byte-for-byte the same. */
  storedSettings: Record<string, unknown>;
  settingsVersion: number;
  managerEditable: string[];
  /** The signed-in person's rank here, or null if they are not a member (e.g. the platform developer). */
  rank: number | null;
}

export type BusinessLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; business: Business; saved: boolean };

const savedKey = (id: string) => `boutique.business.v2.${id}`;

function readSaved(id: string): Business | null {
  try {
    const text = localStorage.getItem(savedKey(id));
    if (!text) return null;
    const value = JSON.parse(text) as Business;
    return { ...value, settings: parseSettings(value.storedSettings) };
  } catch {
    return null;
  }
}

function save(business: Business): void {
  try {
    localStorage.setItem(savedKey(business.id), JSON.stringify(business));
  } catch {
    // The saved copy is only for opening the business offline.
  }
}

/** Public address of a file in the brand-assets bucket. */
export function brandAssetUrl(path: string | null | undefined): string | null {
  if (!path || !supabase) return null;
  return supabase.storage.from('brand-assets').getPublicUrl(path).data.publicUrl;
}

/** A business with its settings, kept on this device so it opens offline. */
export function useBusiness(
  businessId: string,
  userId: string,
): BusinessLoad & { reload: () => Promise<void> } {
  const [load, setLoad] = useState<BusinessLoad>(() => {
    const saved = readSaved(businessId);
    return saved ? { status: 'ready', business: saved, saved: true } : { status: 'loading' };
  });

  const reload = useCallback(async () => {
    if (!supabase) return;
    const [business, member] = await Promise.all([
      supabase
        .from('businesses')
        .select(
          'id, name, currency, locale, time_zone, receipt_prefix, presets(name), business_settings(settings, version, manager_editable)',
        )
        .eq('id', businessId)
        .maybeSingle(),
      supabase
        .from('members')
        .select('rank, disabled')
        .eq('business_id', businessId)
        .eq('user_id', userId)
        .maybeSingle(),
    ]);
    const failure = business.error ?? member.error;
    if (failure) {
      setLoad((current) =>
        current.status === 'ready' ? current : { status: 'error', message: errorMessage(failure) },
      );
      return;
    }
    if (!business.data) {
      setLoad({ status: 'error', message: 'This business was not found, or you are no longer a member.' });
      return;
    }
    const row = business.data;
    const stored = row.business_settings?.settings;
    const storedSettings =
      typeof stored === 'object' && stored !== null && !Array.isArray(stored)
        ? (stored as Record<string, unknown>)
        : {};
    const next: Business = {
      id: row.id,
      name: row.name,
      preset: row.presets?.name ?? '',
      currency: row.currency,
      locale: row.locale,
      timeZone: row.time_zone,
      receiptPrefix: row.receipt_prefix,
      settings: parseSettings(storedSettings),
      storedSettings,
      settingsVersion: row.business_settings?.version ?? 1,
      managerEditable: row.business_settings?.manager_editable ?? [],
      rank: member.data && !member.data.disabled ? member.data.rank : null,
    };
    save(next);
    setLoad({ status: 'ready', business: next, saved: false });
  }, [businessId, userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...load, reload };
}
