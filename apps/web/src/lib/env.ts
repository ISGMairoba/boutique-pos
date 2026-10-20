// Build-time settings. The Supabase URL and publishable key are public values that ship in the
// browser bundle; never put a service-role or secret key in a VITE_ variable.

export const appName = import.meta.env.VITE_APP_NAME?.trim() || 'BoutiquePOS';

export const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() ?? '',
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '',
};

export const hasBackend = Boolean(supabaseConfig.url && supabaseConfig.publishableKey);
