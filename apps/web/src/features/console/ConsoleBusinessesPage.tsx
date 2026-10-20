import type { Database } from '@boutique/db-types';
import { buttonVariants, Notice } from '@boutique/ui';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage, supabase } from '../../lib/supabase.ts';
import { LicenceBadge } from '../licence/LicenceBadge.tsx';
import { formatDate, formatDateTime } from '../licence/labels.ts';

type Row = Database['public']['Functions']['console_businesses']['Returns'][number];
type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; rows: Row[] };

/** Every business on the platform, with its licence and activity. */
export function ConsoleBusinessesPage() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.rpc('console_businesses').then(({ data, error }) => {
      if (!active) return;
      setLoad(
        error ? { status: 'error', message: errorMessage(error) } : { status: 'ready', rows: data ?? [] },
      );
    });
    return () => {
      active = false;
    };
  }, []);

  const rows = load.status === 'ready' ? load.rows : [];
  const needsAttention = rows.filter((row) => row.state !== 'active' && row.state !== 'trial').length;

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">Developer console</h1>
          <p className="text-sm text-muted-foreground">
            {load.status === 'ready'
              ? `${rows.length} business${rows.length === 1 ? '' : 'es'}${needsAttention ? `, ${needsAttention} need attention` : ''}`
              : 'Every business on the platform.'}
          </p>
        </div>
        <Link to="/console/new" className={buttonVariants()}>
          New business
        </Link>
      </div>

      {load.status === 'loading' && <p className="text-sm text-muted-foreground">Loading businesses…</p>}
      {load.status === 'error' && <Notice tone="danger">Could not load businesses: {load.message}</Notice>}
      {load.status === 'ready' && rows.length === 0 && (
        <Notice>No businesses yet. Create the first one with New business.</Notice>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Business</th>
                <th className="px-4 py-2.5 font-semibold">Owner</th>
                <th className="px-4 py-2.5 font-semibold">Licence</th>
                <th className="px-4 py-2.5 font-semibold">Until</th>
                <th className="px-4 py-2.5 text-right font-semibold">Devices</th>
                <th className="px-4 py-2.5 font-semibold">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="px-4 py-3">
                    <Link to={`/console/b/${row.id}`} className="font-medium text-primary hover:underline">
                      {row.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {row.preset_name} · {row.receipt_prefix}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {row.owner_name ?? '—'}
                    {row.owner_username && (
                      <div className="text-xs text-muted-foreground">{row.owner_username}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <LicenceBadge state={row.state} />
                    <div className="mt-1 text-xs capitalize text-muted-foreground">{row.plan_id}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.valid_until ? formatDate(row.valid_until) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.devices}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {row.last_seen_at ? formatDateTime(row.last_seen_at) : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
