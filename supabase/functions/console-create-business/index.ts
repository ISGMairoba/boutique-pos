// Developer console: creates a business with its owner account.
// If the owner's email has no account yet, one is created with a temporary password that the
// developer passes on; the owner must choose a new password at first sign-in. No email is sent,
// so this works without custom SMTP.
//
// POST { name, preset, receiptPrefix, plan, days, trial, brandColour, currency, timeZone, locale,
//        ownerEmail, ownerName, ownerUsername } with the platform developer's Authorization header.
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

// No 0/O, 1/l/I, so the password can be read out over the phone.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function temporaryPassword(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = env('SUPABASE_URL');
  const accessToken = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!accessToken) return json({ error: 'Sign in first.' }, 401);

  const user = createClient(url, env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
  const { error: authError } = await user.auth.getUser(accessToken);
  if (authError) return json({ error: 'Your sign-in has expired. Sign in again.' }, 401);

  const developer = await user.rpc('am_platform_developer');
  if (developer.error || developer.data !== true) {
    return json({ error: 'Only the platform developer can create businesses.' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send the business details.' }, 400);
  }

  const ownerEmail = text(body.ownerEmail).toLowerCase();
  const ownerName = text(body.ownerName);
  const ownerUsername = text(body.ownerUsername).toLowerCase();
  const name = text(body.name);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail))
    return json({ error: 'Enter the owner’s email address.' }, 400);
  if (!ownerName) return json({ error: 'Enter the owner’s name.' }, 400);
  if (!/^[a-z0-9._-]{3,32}$/.test(ownerUsername)) {
    return json(
      { error: 'The owner’s username needs 3 to 32 letters, numbers, dots, dashes or underscores.' },
      400,
    );
  }
  if (!name) return json({ error: 'Enter the business name.' }, 400);

  const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

  const existing = await admin.rpc('console_user_id_by_email', { p_email: ownerEmail });
  if (existing.error) return json({ error: existing.error.message }, 500);

  let ownerId = existing.data as string | null;
  let password: string | null = null;
  if (!ownerId) {
    password = temporaryPassword();
    const created = await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
      user_metadata: { display_name: ownerName, must_change_password: true },
    });
    if (created.error || !created.data.user) {
      return json({ error: created.error?.message ?? 'The owner account could not be created.' }, 400);
    }
    ownerId = created.data.user.id;
  }

  const result = await user.rpc('console_create_business', {
    p_name: name,
    p_preset: text(body.preset),
    p_receipt_prefix: text(body.receiptPrefix),
    p_plan: text(body.plan),
    p_days: Number(body.days),
    p_trial: body.trial === true,
    p_owner: ownerId,
    p_owner_username: ownerUsername,
    p_owner_name: ownerName,
    p_brand_colour: text(body.brandColour) || '#3346d3',
    p_currency: text(body.currency) || 'NGN',
    p_time_zone: text(body.timeZone) || 'Africa/Lagos',
    p_locale: text(body.locale) || 'en-NG',
  });

  if (result.error) {
    // Do not leave a new, unused account behind when the business could not be created.
    if (password) await admin.auth.admin.deleteUser(ownerId);
    return json({ error: result.error.message }, 400);
  }

  return json({
    businessId: result.data,
    ownerEmail,
    temporaryPassword: password,
    existingAccount: !password,
  });
});
