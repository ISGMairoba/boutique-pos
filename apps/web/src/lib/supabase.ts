import type { Database } from '@boutique/db-types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasBackend, supabaseConfig } from './env.ts';

export type Client = SupabaseClient<Database>;

/** The shared client, or null when the build has no backend configured. */
export const supabase: Client | null = hasBackend
  ? createClient<Database>(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

/** A readable message for any error thrown by Supabase or the network. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Something went wrong. Check your connection and try again.';
}
