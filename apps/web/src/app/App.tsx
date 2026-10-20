import { Notice } from '@boutique/ui';
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ChangePasswordPage } from '../features/auth/ChangePasswordPage.tsx';
import { SignInPage } from '../features/auth/SignInPage.tsx';
import { useSession } from '../features/auth/useSession.ts';
import { BusinessLayout } from '../features/business/BusinessLayout.tsx';
import { BusinessPage } from '../features/business/BusinessPage.tsx';
import { ConsoleBusinessesPage } from '../features/console/ConsoleBusinessesPage.tsx';
import { ConsoleBusinessPage } from '../features/console/ConsoleBusinessPage.tsx';
import { ConsoleNewBusinessPage } from '../features/console/ConsoleNewBusinessPage.tsx';
import { HomePage } from '../features/home/HomePage.tsx';
import { SettingsPage } from '../features/settings/SettingsPage.tsx';
import { AppShell } from './AppShell.tsx';
import { usePlatformDeveloper } from './usePlatformDeveloper.ts';

function DeveloperOnly({ isDeveloper, children }: { isDeveloper: boolean | null; children: ReactNode }) {
  if (isDeveloper === null) return <p className="text-sm text-muted-foreground">Checking access…</p>;
  if (!isDeveloper) return <Notice tone="danger">Only the platform developer can open the console.</Notice>;
  return children;
}

export function App() {
  const session = useSession();
  const userId = session.status === 'signed-in' ? session.session.user.id : '';
  const isDeveloper = usePlatformDeveloper(userId);

  if (session.status === 'loading') {
    return <p className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Opening…</p>;
  }

  if (session.status === 'signed-in' && session.session.user.user_metadata?.must_change_password === true) {
    return <ChangePasswordPage email={session.session.user.email ?? ''} />;
  }

  return (
    <BrowserRouter>
      {session.status === 'signed-out' ? (
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="*" element={<Navigate to="/sign-in" replace />} />
        </Routes>
      ) : (
        <AppShell email={session.session.user.email ?? ''} isDeveloper={isDeveloper === true}>
          <Routes>
            <Route path="/" element={<HomePage userId={userId} isDeveloper={isDeveloper === true} />} />
            <Route
              path="/b/:businessId"
              element={<BusinessLayout userId={userId} isDeveloper={isDeveloper === true} />}
            >
              <Route index element={<BusinessPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route
              path="/console"
              element={
                <DeveloperOnly isDeveloper={isDeveloper}>
                  <ConsoleBusinessesPage />
                </DeveloperOnly>
              }
            />
            <Route
              path="/console/new"
              element={
                <DeveloperOnly isDeveloper={isDeveloper}>
                  <ConsoleNewBusinessPage />
                </DeveloperOnly>
              }
            />
            <Route
              path="/console/b/:businessId"
              element={
                <DeveloperOnly isDeveloper={isDeveloper}>
                  <ConsoleBusinessPage />
                </DeveloperOnly>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      )}
    </BrowserRouter>
  );
}
