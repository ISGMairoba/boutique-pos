import { term } from '@boutique/domain';
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
import { LicenceBanner } from '../licence/LicenceBanner.tsx';
import { formatDate, formatDateTime } from '../licence/labels.ts';
import { useBusinessContext } from './BusinessLayout.tsx';

/** A business's overview on this device: licence state and this device's registration. */
export function BusinessPage() {
  const { business, saved, licence: licenceState } = useBusinessContext();
  const { licence, loading, error, refresh } = licenceState;
  const { locale, timeZone, settings } = business;

  return (
    <div className="grid gap-5">
      <p className="-mt-3 text-sm text-muted-foreground">{business.preset}</p>
      {saved && <Notice>Showing the copy saved on this device. It updates when the server answers.</Notice>}

      {business.rank === null ? (
        <Notice>
          You are viewing this business as the platform developer. Devices register only for members.
        </Notice>
      ) : (
        <>
          {licence && <LicenceBanner licence={licence} locale={locale} timeZone={timeZone} />}
          {error && (
            <Notice tone={licence ? 'warning' : 'danger'}>
              {licence
                ? `Could not reach the server, so this shows the licence saved on this device. ${error}`
                : error}
            </Notice>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>The {term(settings, 'till').toLowerCase()}</CardTitle>
          <CardDescription>
            Selling opens here once {term(settings, 'products').toLowerCase()} and checkout are built.
          </CardDescription>
        </CardHeader>
      </Card>

      {business.rank !== null && (
        <Card>
          <CardHeader>
            <CardTitle>This device</CardTitle>
            <CardDescription>
              Each device has its own number, used in its {term(settings, 'receipt').toLowerCase()} numbers.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {loading && !licence && <p className="text-muted-foreground">Checking this device in…</p>}
            {licence && (
              <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Device number</dt>
                <dd className="font-mono">
                  {business.receiptPrefix}-{licence.payload.deviceCode}
                </dd>
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
      )}
    </div>
  );
}
