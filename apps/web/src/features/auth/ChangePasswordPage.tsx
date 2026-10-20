import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Notice,
} from '@boutique/ui';
import { type FormEvent, useId, useState } from 'react';
import { errorMessage, supabase } from '../../lib/supabase.ts';

const MIN_LENGTH = 8;

/** Shown on first sign-in with a temporary password: the owner must choose their own. */
export function ChangePasswordPage({ email }: { email: string }) {
  const passwordId = useId();
  const confirmId = useId();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords are different. Type the same password in both boxes.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    setBusy(false);
    if (updateError) setError(errorMessage(updateError));
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Choose your password</CardTitle>
          <CardDescription>
            You signed in as {email} with a temporary password. Choose your own to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submit}>
            <div className="grid gap-1.5">
              <Label htmlFor={passwordId}>New password</Label>
              <Input
                id={passwordId}
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={confirmId}>Type it again</Label>
              <Input
                id={confirmId}
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
            {error && <Notice tone="danger">{error}</Notice>}
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? 'Saving…' : 'Save password'}
            </Button>
            <Button variant="ghost" onClick={() => supabase?.auth.signOut()}>
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
