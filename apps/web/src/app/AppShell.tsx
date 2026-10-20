import { Button, cn } from '@boutique/ui';
import type { ReactNode } from 'react';
import { appName } from '../lib/env.ts';
import { supabase } from '../lib/supabase.ts';
import { useOnline } from './useOnline.ts';

export function AppShell({ email, children }: { email: string; children: ReactNode }) {
  const online = useOnline();
  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <span className="font-semibold">{appName}</span>
          <span
            className={cn(
              'ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold',
              online ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
            )}
          >
            {online ? 'Online' : 'Offline'}
          </span>
          <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
          <Button variant="outline" size="sm" onClick={() => supabase?.auth.signOut()}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
