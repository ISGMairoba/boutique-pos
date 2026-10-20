import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { SignInPage } from '../features/auth/SignInPage.tsx';
import { useSession } from '../features/auth/useSession.ts';
import { HomePage } from '../features/home/HomePage.tsx';
import { AppShell } from './AppShell.tsx';

export function App() {
  const session = useSession();

  if (session.status === 'loading') {
    return <p className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Opening…</p>;
  }

  return (
    <BrowserRouter>
      {session.status === 'signed-out' ? (
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="*" element={<Navigate to="/sign-in" replace />} />
        </Routes>
      ) : (
        <AppShell email={session.session.user.email ?? ''}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      )}
    </BrowserRouter>
  );
}
