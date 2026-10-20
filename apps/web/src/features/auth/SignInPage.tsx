import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@boutique/ui';
import { type FormEvent, useId, useState } from 'react';
import { useOnline } from '../../app/useOnline.ts';
import { appName, hasBackend } from '../../lib/env.ts';
import { errorMessage, supabase } from '../../lib/supabase.ts';

/** Business sign-in: the owner signs this device in once with their business email. */
export function SignInPage() {
  const online = useOnline();
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'That email and password do not match. Check both and try again.'
          : errorMessage(signInError),
      );
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{appName}</CardTitle>
          <CardDescription>Sign this device in with your business email.</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasBackend ? (
            <p className="rounded-md bg-warning-soft p-3 text-sm text-warning">
              This build has no server configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
            </p>
          ) : (
            <form className="grid gap-4" onSubmit={submit}>
              <div className="grid gap-1.5">
                <Label htmlFor={emailId}>Business email</Label>
                <Input
                  id={emailId}
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={passwordId}>Password</Label>
                <Input
                  id={passwordId}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="rounded-md bg-destructive-soft p-3 text-sm text-destructive">
                  {error}
                </p>
              )}
              {!online && (
                <p className="text-sm text-muted-foreground">
                  You are offline. The first sign-in on a device needs a connection.
                </p>
              )}
              <Button type="submit" size="lg" disabled={busy || !online}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
