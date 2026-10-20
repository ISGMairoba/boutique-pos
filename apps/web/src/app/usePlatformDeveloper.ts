import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.ts';

/** Whether the signed-in account is the platform developer; null while checking. */
export function usePlatformDeveloper(userId: string): boolean | null {
  const [isDeveloper, setIsDeveloper] = useState<boolean | null>(null);
  useEffect(() => {
    setIsDeveloper(null);
    if (!supabase || !userId) return;
    let active = true;
    supabase.rpc('am_platform_developer').then(({ data }) => {
      if (active) setIsDeveloper(data === true);
    });
    return () => {
      active = false;
    };
  }, [userId]);
  return isDeveloper;
}
