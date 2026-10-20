import { type LicenceState, licenceStatus, type StoredLicenceState } from '@boutique/domain';
import {
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Notice,
} from '@boutique/ui';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage, supabase } from '../../lib/supabase.ts';
import { LicenceBadge } from '../licence/LicenceBadge.tsx';

interface BusinessRow {
  id: string;
  name: string;
  preset: string;
  licence: { state: LicenceState; daysLeft: number } | null;
}

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: BusinessRow[] };

/** The businesses this account belongs to, with each licence's current state. */
export function HomePage({ userId, isDeveloper }: { userId: string; isDeveloper: boolean }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase
      .from('businesses')
      .select('id, name, presets(name), licences(state, valid_until, grace_days), members!inner(user_id)')
      .eq('members.user_id', userId)
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
              licence: status ? { state: status.state, daysLeft: status.daysLeft } : null,
            };
          }),
        });
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <section className="grid gap-5">
      {isDeveloper && (
        <Card>
          <CardHeader>
            <CardTitle>Developer console</CardTitle>
            <CardDescription>Create businesses, manage licences and see every shop.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/console" className={buttonVariants()}>
              Open console
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Your businesses</h1>
        <p className="text-sm text-muted-foreground">Choose a business to open it on this device.</p>
      </div>

      {load.status === 'loading' && <p className="text-sm text-muted-foreground">Loading businesses…</p>}
      {load.status === 'error' && <Notice tone="danger">Could not load businesses: {load.message}</Notice>}

      {load.status === 'ready' && load.rows.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No business on this account yet</CardTitle>
            <CardDescription>
              Your business appears here once your installer has set it up and added you.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {load.status === 'ready' && load.rows.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {load.rows.map((row) => (
            <li key={row.id}>
              <Link
                to={`/b/${row.id}`}
                className="block rounded-lg border bg-card p-5 transition-colors hover:border-primary"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-lg font-semibold leading-tight">{row.name}</span>
                  <LicenceBadge state={row.licence?.state} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{row.preset}</p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {!row.licence
                    ? 'No licence set up yet.'
                    : row.licence.daysLeft > 0
                      ? `${row.licence.daysLeft} day${row.licence.daysLeft === 1 ? '' : 's'} left`
                      : 'Selling is paused. Contact your installer.'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
