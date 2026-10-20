import { useCallback, useEffect, useState } from 'react';
import { useOnline } from '../../app/useOnline.ts';
import { cachedLicence, checkIn, type DeviceLicence, describe } from '../../lib/licence.ts';
import { errorMessage } from '../../lib/supabase.ts';

export interface DeviceLicenceState {
  licence: DeviceLicence | null;
  /** True until the saved copy has been read and, when online, the server has answered. */
  loading: boolean;
  /** Why the last check-in failed, if it did. */
  error: string | null;
  refresh: () => void;
}

/**
 * This device's licence for a business. Shows the saved copy at once, then checks in with the
 * server whenever the device is online, so the state is right both offline and after a change.
 * Pass enabled = false for someone who is not a member (the platform developer looking in).
 */
export function useDeviceLicence(businessId: string, enabled = true): DeviceLicenceState {
  const online = useOnline();
  const [licence, setLicence] = useState<DeviceLicence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt re-runs the check-in on refresh.
  useEffect(() => {
    let active = true;
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const saved = await cachedLicence(businessId).catch(() => null);
      if (active && saved) setLicence(describe(saved, 'saved'));
      if (!online) {
        if (active) setLoading(false);
        return;
      }
      try {
        const fresh = await checkIn(businessId);
        if (active) {
          setLicence(describe(fresh, 'server'));
          setError(null);
        }
      } catch (failure) {
        if (active) setError(errorMessage(failure));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [businessId, online, attempt, enabled]);

  return { licence, loading, error, refresh };
}
