import { DEFAULT_BRAND_COLOUR } from '@boutique/domain';
import {
  Button,
  buildBrandPalette,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldHint,
  Input,
  isHexColour,
  Label,
  Notice,
  Select,
} from '@boutique/ui';
import { type FormEvent, type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { callFunction } from '../../lib/functions.ts';
import { errorMessage, supabase } from '../../lib/supabase.ts';

interface Option {
  id: string;
  name: string;
}

interface Created {
  businessId: string;
  ownerEmail: string;
  temporaryPassword: string | null;
  existingAccount: boolean;
}

/** "Little Sprouts Kids" → "LSK"; used until the developer types their own prefix. */
export function suggestPrefix(name: string): string {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  const initials = words.map((word) => word[0]).join('');
  return (initials.length >= 2 ? initials : (words[0] ?? '')).slice(0, 4);
}

/** "Amaka Obi" → "amaka.obi". */
export function suggestUsername(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 32);
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <FieldHint error>{error}</FieldHint> : hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}

export function ConsoleNewBusinessPage() {
  const ids = {
    name: useId(),
    preset: useId(),
    prefix: useId(),
    colour: useId(),
    plan: useId(),
    days: useId(),
    ownerName: useId(),
    ownerEmail: useId(),
    ownerUsername: useId(),
    currency: useId(),
    timeZone: useId(),
    locale: useId(),
  };
  const [presets, setPresets] = useState<Option[]>([]);
  const [plans, setPlans] = useState<Option[]>([]);
  const [name, setName] = useState('');
  const [preset, setPreset] = useState('');
  const [prefix, setPrefix] = useState('');
  const [prefixEdited, setPrefixEdited] = useState(false);
  const [colour, setColour] = useState(DEFAULT_BRAND_COLOUR);
  const [plan, setPlan] = useState('trial');
  const [trial, setTrial] = useState(true);
  const [days, setDays] = useState('14');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerUsername, setOwnerUsername] = useState('');
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [currency, setCurrency] = useState('NGN');
  const [timeZone, setTimeZone] = useState('Africa/Lagos');
  const [locale, setLocale] = useState('en-NG');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('presets')
      .select('key, name')
      .order('sort')
      .then(({ data }) => {
        const options = (data ?? []).map((row) => ({ id: row.key, name: row.name }));
        setPresets(options);
        setPreset((current) => current || options[0]?.id || '');
      });
    supabase
      .from('plans')
      .select('id, name')
      .eq('archived', false)
      .order('created_at')
      .then(({ data }) => setPlans((data ?? []).map((row) => ({ id: row.id, name: row.name }))));
  }, []);

  const shownPrefix = prefixEdited ? prefix : suggestPrefix(name);
  const shownUsername = usernameEdited ? ownerUsername : suggestUsername(ownerName);

  const colourError = useMemo(() => {
    if (!isHexColour(colour)) return 'Use a colour like #7a1f5c.';
    try {
      buildBrandPalette(colour);
      return '';
    } catch (failure) {
      return errorMessage(failure);
    }
  }, [colour]);

  function chooseTrial(value: boolean) {
    setTrial(value);
    setDays(value ? '14' : '365');
    if (value) setPlan('trial');
    else if (plan === 'trial') setPlan('starter');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (colourError) {
      setError(colourError);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await callFunction<Created>('console-create-business', {
        name,
        preset,
        receiptPrefix: shownPrefix,
        plan,
        days: Number(days),
        trial,
        brandColour: colour,
        currency,
        timeZone,
        locale,
        ownerName,
        ownerEmail,
        ownerUsername: shownUsername,
      });
      setCreated(result);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function copyCredentials() {
    if (!created?.temporaryPassword) return;
    const text = `${name}\nSign in at ${window.location.origin}\nEmail: ${created.ownerEmail}\nTemporary password: ${created.temporaryPassword}\nYou will choose your own password when you first sign in.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (created) {
    return (
      <section className="grid max-w-xl gap-5">
        <h1 className="text-2xl font-semibold">{name} is ready</h1>
        {created.temporaryPassword ? (
          <Card>
            <CardHeader>
              <CardTitle>Give these to the owner</CardTitle>
              <CardDescription>
                This password is shown only once. The owner chooses their own password when they first sign
                in.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Sign in at</dt>
                <dd className="break-all">{window.location.origin}</dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="break-all">{created.ownerEmail}</dd>
                <dt className="text-muted-foreground">Temporary password</dt>
                <dd className="select-all font-mono text-base">{created.temporaryPassword}</dd>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button onClick={copyCredentials}>{copied ? 'Copied' : 'Copy sign-in details'}</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Notice tone="success">
            {created.ownerEmail} already had an account, so it was added to this business as its Manager. They
            sign in with their current password.
          </Notice>
        )}
        <div className="flex flex-wrap gap-2">
          <Link to={`/console/b/${created.businessId}`} className={buttonVariants({ variant: 'outline' })}>
            Open business in console
          </Link>
          <Link to="/console" className={buttonVariants({ variant: 'ghost' })}>
            Back to all businesses
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="grid max-w-2xl gap-5">
      <Link to="/console" className="text-sm text-muted-foreground hover:text-foreground">
        ← Developer console
      </Link>
      <h1 className="text-2xl font-semibold">New business</h1>

      <form className="grid gap-5" onSubmit={submit}>
        <Card>
          <CardHeader>
            <CardTitle>Business</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field id={ids.name} label="Business name">
                <Input
                  id={ids.name}
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
            </div>
            <Field
              id={ids.preset}
              label="Business type"
              hint="Sets the starting categories, sizes and wording."
            >
              <Select id={ids.preset} required value={preset} onChange={(e) => setPreset(e.target.value)}>
                {presets.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id={ids.prefix}
              label="Receipt prefix"
              hint="1 to 6 letters or numbers, e.g. LS for LS-01-000123."
            >
              <Input
                id={ids.prefix}
                required
                maxLength={6}
                pattern="[A-Za-z0-9]{1,6}"
                value={shownPrefix}
                onChange={(e) => {
                  setPrefixEdited(true);
                  setPrefix(e.target.value.toUpperCase());
                }}
              />
            </Field>
            <Field id={ids.colour} label="Brand colour" error={colourError || undefined}>
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Pick brand colour"
                  value={isHexColour(colour) ? colour : DEFAULT_BRAND_COLOUR}
                  onChange={(e) => setColour(e.target.value)}
                  className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
                />
                <Input id={ids.colour} value={colour} onChange={(e) => setColour(e.target.value.trim())} />
              </div>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Licence</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <fieldset className="grid gap-2 sm:col-span-2">
              <legend className="mb-1.5 text-sm font-medium">Start with</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="licence-kind"
                    checked={trial}
                    onChange={() => chooseTrial(true)}
                  />
                  Free trial
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="licence-kind"
                    checked={!trial}
                    onChange={() => chooseTrial(false)}
                  />
                  Paid licence
                </label>
              </div>
            </fieldset>
            <Field id={ids.plan} label="Plan" hint="Sets the device, staff and product limits.">
              <Select id={ids.plan} value={plan} onChange={(e) => setPlan(e.target.value)}>
                {plans.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id={ids.days} label="Length in days">
              <Input
                id={ids.days}
                type="number"
                min={1}
                max={3660}
                required
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Owner</CardTitle>
            <CardDescription>
              The owner becomes the business's Manager. A new account gets a temporary password to pass on.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id={ids.ownerName} label="Full name">
              <Input
                id={ids.ownerName}
                required
                maxLength={80}
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
              />
            </Field>
            <Field id={ids.ownerEmail} label="Email">
              <Input
                id={ids.ownerEmail}
                type="email"
                required
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
              />
            </Field>
            <Field
              id={ids.ownerUsername}
              label="Username"
              hint="Used later for staff sign-in on shared devices."
            >
              <Input
                id={ids.ownerUsername}
                required
                minLength={3}
                maxLength={32}
                pattern="[a-z0-9._\-]{3,32}"
                value={shownUsername}
                onChange={(e) => {
                  setUsernameEdited(true);
                  setOwnerUsername(e.target.value.toLowerCase());
                }}
              />
            </Field>
          </CardContent>
        </Card>

        <details className="rounded-lg border bg-card p-5">
          <summary className="cursor-pointer text-sm font-medium">Currency, time zone and language</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field id={ids.currency} label="Currency">
              <Input
                id={ids.currency}
                required
                maxLength={3}
                pattern="[A-Za-z]{3}"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </Field>
            <Field id={ids.timeZone} label="Time zone">
              <Input
                id={ids.timeZone}
                required
                value={timeZone}
                onChange={(e) => setTimeZone(e.target.value.trim())}
              />
            </Field>
            <Field id={ids.locale} label="Number and date format">
              <Input
                id={ids.locale}
                required
                value={locale}
                onChange={(e) => setLocale(e.target.value.trim())}
              />
            </Field>
          </div>
        </details>

        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="lg" disabled={busy || !preset}>
            {busy ? 'Creating…' : 'Create business'}
          </Button>
          <Link to="/console" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
