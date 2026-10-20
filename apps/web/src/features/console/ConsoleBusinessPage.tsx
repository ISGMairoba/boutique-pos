import { businessDate, endOfBusinessDay, licenceStatus, type StoredLicenceState } from '@boutique/domain';
import {
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldHint,
  Input,
  Label,
  Notice,
  Select,
  Textarea,
} from '@boutique/ui';
import { useCallback, useEffect, useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { errorMessage, supabase } from '../../lib/supabase.ts';
import { LicenceBadge } from '../licence/LicenceBadge.tsx';
import { formatDate, formatDateTime } from '../licence/labels.ts';
import { ManagerTabsCard } from './ManagerTabsCard.tsx';

interface Detail {
  name: string;
  preset: string;
  prefix: string;
  timeZone: string;
  locale: string;
  licence: {
    plan: string;
    state: StoredLicenceState;
    validUntil: string;
    graceDays: number;
    notes: string | null;
  } | null;
  members: { userId: string; name: string; username: string; rank: number; disabled: boolean }[];
  devices: { id: string; code: string; name: string; lastSeen: string | null; retired: boolean }[];
  actions: { id: number; action: string; reason: string | null; at: string }[];
}

type Action = 'extend' | 'change_plan' | 'read_only' | 'suspend' | 'restore';

const actionLabel: Record<string, string> = {
  'business.create': 'Business created',
  'licence.extend': 'Licence extended',
  'licence.change_plan': 'Plan changed',
  'licence.read_only': 'Made read-only',
  'licence.suspend': 'Suspended',
  'licence.restore': 'Restored',
  'settings.change': 'Settings changed',
  'support.access': 'Support access',
};

const rankLabel = ['Disabled', 'Cashier', 'Admin', 'Manager', 'Developer'];

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function ConsoleBusinessPage() {
  const { businessId = '' } = useParams();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [plans, setPlans] = useState<{ id: string; name: string }[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [untilDay, setUntilDay] = useState('');
  const [newPlan, setNewPlan] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [done, setDone] = useState('');
  const reasonId = useId();
  const untilId = useId();
  const planId = useId();

  const load = useCallback(async () => {
    if (!supabase) return;
    const [business, members, devices, actions] = await Promise.all([
      supabase
        .from('businesses')
        .select(
          'name, receipt_prefix, time_zone, locale, presets(name), licences(plan_id, state, valid_until, grace_days, notes)',
        )
        .eq('id', businessId)
        .maybeSingle(),
      supabase
        .from('members')
        .select('user_id, display_name, username, rank, disabled')
        .eq('business_id', businessId)
        .order('rank', { ascending: false }),
      supabase
        .from('devices')
        .select('id, code, name, last_seen_at, retired')
        .eq('business_id', businessId)
        .order('code'),
      supabase
        .from('developer_actions')
        .select('id, action, reason, at')
        .eq('business_id', businessId)
        .order('at', { ascending: false })
        .limit(50),
    ]);
    const failure = business.error ?? members.error ?? devices.error ?? actions.error;
    if (failure) {
      setLoadError(errorMessage(failure));
      return;
    }
    if (!business.data) {
      setLoadError('This business was not found.');
      return;
    }
    const licence = business.data.licences;
    setDetail({
      name: business.data.name,
      preset: business.data.presets?.name ?? '',
      prefix: business.data.receipt_prefix,
      timeZone: business.data.time_zone,
      locale: business.data.locale,
      licence: licence
        ? {
            plan: licence.plan_id,
            state: licence.state as StoredLicenceState,
            validUntil: licence.valid_until,
            graceDays: licence.grace_days,
            notes: licence.notes,
          }
        : null,
      members: (members.data ?? []).map((m) => ({
        userId: m.user_id,
        name: m.display_name,
        username: m.username,
        rank: m.rank,
        disabled: m.disabled,
      })),
      devices: (devices.data ?? []).map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        lastSeen: d.last_seen_at,
        retired: d.retired,
      })),
      actions: actions.data ?? [],
    });
    setLoadError('');
  }, [businessId]);

  useEffect(() => {
    void load();
    supabase
      ?.from('plans')
      .select('id, name')
      .eq('archived', false)
      .order('created_at')
      .then(({ data }) => setPlans(data ?? []));
  }, [load]);

  if (loadError && !detail) {
    return (
      <section className="grid gap-4">
        <Link to="/console" className="text-sm text-muted-foreground hover:text-foreground">
          ← Developer console
        </Link>
        <Notice tone="danger">{loadError}</Notice>
      </section>
    );
  }
  if (!detail) return <p className="text-sm text-muted-foreground">Loading business…</p>;

  const { licence } = detail;
  const status = licence
    ? licenceStatus(
        { state: licence.state, validUntil: new Date(licence.validUntil), graceDays: licence.graceDays },
        new Date(),
      )
    : null;
  const today = businessDate(new Date(), detail.timeZone);
  const currentEnd = licence ? businessDate(new Date(licence.validUntil), detail.timeZone) : today;
  const extendFrom = currentEnd > today ? currentEnd : today;
  const date = (value: string) => formatDate(value, detail.locale, detail.timeZone);

  function open(next: Action) {
    setAction(next);
    setReason('');
    setActionError('');
    setDone('');
    if (next === 'extend') setUntilDay(addDays(extendFrom, 30));
    if (next === 'change_plan') setNewPlan(licence?.plan ?? '');
  }

  async function confirm() {
    if (!supabase || !action || !detail) return;
    setBusy(true);
    setActionError('');
    const { error } = await supabase.rpc('console_update_licence', {
      p_business: businessId,
      p_action: action,
      p_reason: reason.trim() || undefined,
      p_valid_until:
        action === 'extend' ? endOfBusinessDay(untilDay, detail.timeZone).toISOString() : undefined,
      p_plan: action === 'change_plan' ? newPlan : undefined,
    });
    setBusy(false);
    if (error) {
      setActionError(errorMessage(error));
      return;
    }
    setDone(
      {
        extend: `Licence extended to ${untilDay}.`,
        change_plan: 'Plan changed.',
        read_only: 'The business is now read-only.',
        suspend: 'The business is suspended.',
        restore: 'The business is active again.',
      }[action],
    );
    setAction(null);
    await load();
  }

  const needsReason = action === 'read_only' || action === 'suspend';

  return (
    <section className="grid gap-5">
      <Link to="/console" className="text-sm text-muted-foreground hover:text-foreground">
        ← Developer console
      </Link>
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{detail.name}</h1>
          <LicenceBadge state={status?.state} />
        </div>
        <p className="text-sm text-muted-foreground">
          {detail.preset} · receipts {detail.prefix}-…
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            to={`/b/${businessId}/settings`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Open business settings
          </Link>
        </div>
      </div>

      {done && <Notice tone="success">{done}</Notice>}

      <Card>
        <CardHeader>
          <CardTitle>Licence</CardTitle>
          {licence && status && (
            <CardDescription>
              {licence.plan} plan, until {date(licence.validUntil)}
              {status.state === 'grace' && `. Selling stops on ${date(status.graceEndsAt.toISOString())}`}
              {licence.notes && ` · Note: ${licence.notes}`}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={action === 'extend' ? 'default' : 'outline'}
              size="sm"
              onClick={() => open('extend')}
            >
              Extend or renew
            </Button>
            <Button
              variant={action === 'change_plan' ? 'default' : 'outline'}
              size="sm"
              onClick={() => open('change_plan')}
            >
              Change plan
            </Button>
            {(licence?.state === 'read_only' || licence?.state === 'suspended') && (
              <Button
                variant={action === 'restore' ? 'default' : 'outline'}
                size="sm"
                onClick={() => open('restore')}
              >
                Restore
              </Button>
            )}
            {licence?.state !== 'read_only' && (
              <Button
                variant={action === 'read_only' ? 'default' : 'outline'}
                size="sm"
                onClick={() => open('read_only')}
              >
                Make read-only
              </Button>
            )}
            {licence?.state !== 'suspended' && (
              <Button
                variant={action === 'suspend' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => open('suspend')}
              >
                Suspend
              </Button>
            )}
          </div>

          {action && (
            <div className="grid gap-4 rounded-md border bg-surface p-4">
              {action === 'extend' && (
                <div className="grid max-w-xs gap-1.5">
                  <Label htmlFor={untilId}>Licence ends on</Label>
                  <Input
                    id={untilId}
                    type="date"
                    min={addDays(today, 1)}
                    value={untilDay}
                    onChange={(e) => setUntilDay(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    {[30, 90, 365].map((n) => (
                      <Button
                        key={n}
                        variant="ghost"
                        size="sm"
                        onClick={() => setUntilDay(addDays(extendFrom, n))}
                      >
                        +{n} days
                      </Button>
                    ))}
                  </div>
                  <FieldHint>Extending also makes a trial, read-only or suspended business active.</FieldHint>
                </div>
              )}
              {action === 'change_plan' && (
                <div className="grid max-w-xs gap-1.5">
                  <Label htmlFor={planId}>Plan</Label>
                  <Select id={planId} value={newPlan} onChange={(e) => setNewPlan(e.target.value)}>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {action === 'restore' && (
                <p className="text-sm">
                  Staff can sell again. If the licence date has passed, the business goes into its grace
                  period.
                </p>
              )}
              {needsReason && (
                <p className="text-sm">
                  {action === 'suspend'
                    ? 'Staff will not be able to sign in or sell. Records are kept.'
                    : 'Staff can view and export records but cannot sell or change anything.'}
                </p>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor={reasonId}>{needsReason ? 'Reason' : 'Note (optional)'}</Label>
                <Textarea
                  id={reasonId}
                  maxLength={1000}
                  required={needsReason}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    needsReason ? 'For example: invoice for October unpaid' : 'For example: paid by transfer'
                  }
                />
                {needsReason && <FieldHint>The business owner sees this reason.</FieldHint>}
              </div>
              {actionError && <Notice tone="danger">{actionError}</Notice>}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={action === 'suspend' ? 'destructive' : 'default'}
                  onClick={confirm}
                  disabled={busy || (needsReason && !reason.trim()) || (action === 'extend' && !untilDay)}
                >
                  {busy
                    ? 'Saving…'
                    : {
                        extend: 'Save new date',
                        change_plan: 'Change plan',
                        read_only: 'Make read-only',
                        suspend: 'Suspend business',
                        restore: 'Restore business',
                      }[action]}
                </Button>
                <Button variant="ghost" onClick={() => setAction(null)} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ManagerTabsCard businessId={businessId} onSaved={() => void load()} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Staff</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {detail.members.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    {m.name} <span className="text-muted-foreground">({m.username})</span>
                  </span>
                  <span className="text-muted-foreground">{m.disabled ? 'Disabled' : rankLabel[m.rank]}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Devices</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No device has opened this business yet.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {detail.devices.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <span className="font-mono">{d.code}</span> {d.name}
                      {d.retired && <span className="text-muted-foreground"> (removed)</span>}
                    </span>
                    <span className="text-muted-foreground">
                      {d.lastSeen ? formatDateTime(d.lastSeen, detail.locale, detail.timeZone) : 'Never'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Every change made from the console.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-2 text-sm">
            {detail.actions.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  {actionLabel[a.action] ?? a.action}
                  {a.reason && <span className="text-muted-foreground"> · {a.reason}</span>}
                </span>
                <span className="text-muted-foreground">
                  {formatDateTime(a.at, detail.locale, detail.timeZone)}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </section>
  );
}
