import { Button, cn } from '@boutique/ui';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { appName } from '../lib/env.ts';
import { supabase } from '../lib/supabase.ts';
import { useOnline } from './useOnline.ts';

export function AppShell({
  email,
  isDeveloper,
  children,
}: {
  email: string;
  isDeveloper: boolean;
  children: ReactNode;
}) {
  const online = useOnline();
  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <img src="/icon.svg" alt="" className="h-8 w-8" />
            <span className="font-semibold">{appName}</span>
          </Link>
          {isDeveloper && (
            <NavLink
              to="/console"
              className={({ isActive }) =>
                cn(
                  'rounded-md px-2.5 py-1 text-sm font-medium',
                  isActive ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              Console
            </NavLink>
          )}
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
