import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Notice,
} from '@boutique/ui';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { applyBrand, resetBrand } from '../../app/theme.ts';
import { errorMessage, supabase } from '../../lib/supabase.ts';
import { LicenceBadge } from '../licence/LicenceBadge.tsx';
import { LicenceBanner } from '../licence/LicenceBanner.tsx';
import { formatDate, formatDateTime } from '../licence/labels.ts';
import { useDeviceLicence } from '../licence/useDeviceLicence.ts';

interface BusinessSummary {
  id: string;
  name: string;
  preset: string;
  locale: string;
  timeZone: string;
  brandColour: string | null;
}

const summaryKey = (id: string) => `boutique.business.${id}`;

function readSaved(id: string): BusinessSummary | null {
  try {
    const text = localStorage.getItem(summaryKey(id));
    return text ? (JSON.parse(text) as BusinessSummary) : null;
  } catch {
    return null;
  }
}

function brandColourOf(settings: unknown): string | null {
  if (typeof settings !== 'object' || settings === null) return null;
  const brand = (settings as { brand?: { colour?: unknown } }).brand;
  return typeof brand?.colour === 'string' ? brand.colour : null;
}

/** A business opened on this device: its brand, licence state and this device's registration. */
export function BusinessPage() {
  const { businessId = '' } = useParams();
  const [business, setBusiness] = useState<BusinessSummary | null>(() => readSaved(businessId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const { licence, loading, error, refresh } = useDeviceLicence(businessId);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase
      .from('businesses')
      .select('id, name, locale, time_zone, presets(name), business_settings(settings)')
      .eq('id', businessId)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        if (fetchError) {
          setLoadError(errorMessage(fetchError));
          return;
        }
        if (!data) {
          setLoadError('This business was not found, or you are no longer a member.');
          return;
        }
        const summary: BusinessSummary = {
          id: data.id,
          name: data.name,
          preset: data.presets?.name ?? '',
          locale: data.locale,
          timeZone: data.time_zone,
          brandColour: brandColourOf(data.business_settings?.settings),
        };
        setBusiness(summary);
        setLoadError(null);
        try {
          localStorage.setItem(summaryKey(businessId), JSON.stringify(summary));
        } catch {
          // Saved copy is a convenience for offline use only.
        }
      });
    return () => {
      active = false;
    };
  }, [businessId]);

  useEffect(() => {
    if (!business?.brandColour) return;
    try {
      applyBrand(business.brandColour);
    } catch {
      // A colour the palette builder refuses leaves the product's own colours in place.
    }
    return resetBrand;
  }, [business?.brandColour]);

  const locale = business?.locale ?? 'en-NG';
  const timeZone = business?.timeZone ?? 'Africa/Lagos';

  return (
    <section className="grid gap-5">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← All businesses
      </Link>

      {!business && loadError && <Notice tone="danger">{loadError}</Notice>}
      {!business && !loadError && <p className="text-sm text-muted-foreground">Opening business…</p>}

      {business && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{business.name}</h1>
            <LicenceBadge state={licence?.status.state} />
          </div>
          <p className="-mt-3 text-sm text-muted-foreground">{business.preset}</p>

          {licence && <LicenceBanner licence={licence} locale={locale} timeZone={timeZone} />}
          {error && (
            <Notice tone={licence ? 'warning' : 'danger'}>
              {licence
                ? `Could not reach the server, so this shows the licence saved on this device. ${error}`
                : error}
            </Notice>
          )}

          <Card>
            <CardHeader>
              <CardTitle>The till</CardTitle>
              <CardDescription>Selling opens here once the catalogue and checkout are built.</CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>This device</CardTitle>
              <CardDescription>Each device has its own number, used in its receipt numbers.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {loading && !licence && <p className="text-muted-foreground">Checking this device in…</p>}
              {licence && (
                <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2">
                  <dt className="text-muted-foreground">Device number</dt>
                  <dd className="font-mono">{licence.payload.deviceCode}</dd>
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="capitalize">{licence.payload.plan}</dd>
                  <dt className="text-muted-foreground">Licence until</dt>
                  <dd>{formatDate(licence.payload.validUntil, locale, timeZone)}</dd>
                  <dt className="text-muted-foreground">Last check-in</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    {formatDateTime(licence.payload.checkedInAt, locale, timeZone)}
                    {licence.source === 'saved' && <Badge>Saved copy</Badge>}
                  </dd>
                  <dt className="text-muted-foreground">Check in by</dt>
                  <dd>{formatDateTime(licence.status.checkInBy, locale, timeZone)}</dd>
                </dl>
              )}
              <div>
                <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                  {loading ? 'Checking…' : 'Check in now'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
