import { errorMessage, supabase } from './supabase.ts';

/** The message an Edge Function sent with a failed response, if it sent one. */
async function messageFrom(error: unknown): Promise<string> {
  const context =
    typeof error === 'object' && error !== null ? (error as { context?: unknown }).context : null;
  if (context instanceof Response) {
    try {
      const body: unknown = await context.clone().json();
      if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
        return body.error;
      }
    } catch {
      // Not JSON; fall back to the generic message.
    }
  }
  return errorMessage(error);
}

/** Calls an Edge Function as the signed-in user and returns its JSON answer, or throws its message. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('This build has no server configured.');
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) throw new Error(await messageFrom(error));
  if (data === null || data === undefined) throw new Error('The server sent no answer. Try again.');
  return data;
}
