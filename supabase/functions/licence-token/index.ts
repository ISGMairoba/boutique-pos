// Registers the calling device with a business (if new) and returns a signed licence token.
// The app verifies the token with the public key it ships with, so a device knows its licence
// state while offline. Token format must match packages/domain/src/licence-token.ts.
//
// POST { businessId, deviceId, deviceName } with the signed-in user's Authorization header.
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let signingKey: CryptoKey | null = null;

async function getSigningKey(): Promise<CryptoKey> {
  if (signingKey) return signingKey;
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data, error } = await admin.rpc('licence_signing_key');
  if (error || !data) throw new Error('The licence signing key is not set up.');
  signingKey = await crypto.subtle.importKey(
    'jwk',
    data as JsonWebKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  return signingKey;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const authorization = req.headers.get('Authorization') ?? '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '');
  if (!accessToken) return json({ error: 'Sign in first.' }, 401);

  const user = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
  const { error: authError } = await user.auth.getUser(accessToken);
  if (authError) return json({ error: 'Your sign-in has expired. Sign in again.' }, 401);

  let body: { businessId?: unknown; deviceId?: unknown; deviceName?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send the business, device and device name.' }, 400);
  }
  const { businessId, deviceId, deviceName } = body;
  if (
    typeof businessId !== 'string' ||
    !uuid.test(businessId) ||
    typeof deviceId !== 'string' ||
    !uuid.test(deviceId)
  ) {
    return json({ error: 'Send a valid business and device.' }, 400);
  }
  const name =
    typeof deviceName === 'string' && deviceName.trim() ? deviceName.trim().slice(0, 60) : 'Device';

  const registered = await user.rpc('register_device', {
    p_business: businessId,
    p_device: deviceId,
    p_name: name,
  });
  if (registered.error) return json({ error: registered.error.message, code: registered.error.code }, 403);

  const checkIn = await user.rpc('device_check_in', { p_business: businessId, p_device: deviceId }).single();
  if (checkIn.error || !checkIn.data)
    return json({ error: checkIn.error?.message ?? 'Check-in failed.' }, 403);
  const row = checkIn.data as {
    device_code: string;
    plan_id: string;
    state: string;
    state_changed_at: string;
    valid_until: string;
    grace_days: number;
    max_offline_days: number;
    checked_in_at: string;
  };

  const payload = {
    v: 1,
    businessId,
    deviceId,
    deviceCode: row.device_code,
    plan: row.plan_id,
    state: row.state,
    stateChangedAt: new Date(row.state_changed_at).toISOString(),
    validUntil: new Date(row.valid_until).toISOString(),
    graceDays: row.grace_days,
    maxOfflineDays: row.max_offline_days,
    checkedInAt: new Date(row.checked_in_at).toISOString(),
  };

  try {
    const key = await getSigningKey();
    const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(encoded),
    );
    return json({ token: `${encoded}.${base64Url(new Uint8Array(signature))}`, payload });
  } catch (error) {
    console.error(error);
    return json({ error: 'The licence could not be signed. Try again shortly.' }, 500);
  }
});
