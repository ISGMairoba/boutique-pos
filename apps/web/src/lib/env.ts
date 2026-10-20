// Build-time settings. The Supabase URL, publishable key and licence public key are public values
// that ship in the browser bundle; never put a service-role or secret key in a VITE_ variable.

export const appName = import.meta.env.VITE_APP_NAME?.trim() || 'BoutiquePOS';

export const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() ?? '',
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '',
};

export const hasBackend = Boolean(supabaseConfig.url && supabaseConfig.publishableKey);

function parseJwk(text: string | undefined): JsonWebKey | null {
  if (!text?.trim()) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? (value as JsonWebKey) : null;
  } catch {
    return null;
  }
}

/** Public key that licence tokens are checked against (see packages/domain/src/licence-token.ts). */
export const licencePublicKey = parseJwk(import.meta.env.VITE_LICENCE_PUBLIC_KEY);
