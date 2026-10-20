import { type LicenceState, licenceStatus, type StoredLicenceState } from '@boutique/domain';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from '@boutique/ui';
import { useEffect, useState } from 'react';
import { errorMessage, supabase } from '../../lib/supabase.ts';

interface BusinessRow {
  id: string;
  name: string;
  preset: string;
  licence: { state: LicenceState; daysLeft: number; plan: string } | null;
}

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: BusinessRow[] };

const stateLabel: Record<LicenceState, string> = {
  trial: 'Trial',
  active: 'Active',
  grace: 'Payment overdue',
  read_only: 'Read-only',
  suspended: 'Suspended',
};

const stateStyle: Record<LicenceState, string> = {
  trial: 'bg-primary-soft text-primary',
  active: 'bg-success-soft text-success',
  grace: 'bg-warning-soft text-warning',
  read_only: 'bg-destructive-soft text-destructive',
  suspended: 'bg-destructive-soft text-destructive',
};

/** The businesses this account belongs to, with each licence's current state. */
export function HomePage() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase
      .from('businesses')
      .select('id, name, presets(name), licences(plan_id, state, valid_until, grace_days)')
      .order('name')
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setLoad({ status: 'error', message: errorMessage(error) });
          return;
        }
        const now = new Date();
        setLoad({
          status: 'ready',
          rows: data.map((business) => {
            const licence = business.licences;
            const status = licence
              ? licenceStatus(
                  {
                    state: licence.state as StoredLicenceState,
                    validUntil: new Date(licence.valid_until),
                    graceDays: licence.grace_days,
                  },
                  now,
                )
              : null;
            return {
              id: business.id,
              name: business.name,
              preset: business.presets?.name ?? '',
              licence:
                status && licence
                  ? { state: status.state, daysLeft: status.daysLeft, plan: licence.plan_id }
                  : null,
            };
          }),
        });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Your businesses</h1>
        <p className="text-sm text-muted-foreground">Choose a business to open its till.</p>
      </div>

      {load.status === 'loading' && <p className="text-sm text-muted-foreground">Loading businesses…</p>}

      {load.status === 'error' && (
        <p role="alert" className="rounded-md bg-destructive-soft p-3 text-sm text-destructive">
          Could not load businesses: {load.message}
        </p>
      )}

      {load.status === 'ready' && load.rows.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No business on this account yet</CardTitle>
            <CardDescription>
              Your business appears here once your installer has set it up and added you as a member.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {load.status === 'ready' && load.rows.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {load.rows.map((row) => (
            <li key={row.id}>
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle>{row.name}</CardTitle>
                    {row.licence && (
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                          stateStyle[row.licence.state],
                        )}
                      >
                        {stateLabel[row.licence.state]}
                      </span>
                    )}
                  </div>
                  <CardDescription>{row.preset}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {row.licence
                    ? row.licence.daysLeft > 0
                      ? `${row.licence.daysLeft} day${row.licence.daysLeft === 1 ? '' : 's'} left on the ${row.licence.plan} plan`
                      : 'Selling is paused. Contact your installer to renew.'
                    : 'No licence set up yet.'}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
