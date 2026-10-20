// Signed licence tokens. The licence-token Edge Function signs one each time a device checks in;
// the device keeps it and checks the signature with the public key built into the app, so it knows
// its licence state while offline and cannot forge a longer one.
//
// Format: base64url(JSON payload) "." base64url(ECDSA P-256 / SHA-256 signature, raw r||s).
// supabase/functions/licence-token/index.ts signs with the same format; keep the two in step.

import {
  type LicenceStatus,
  licenceStatus,
  offlineCheckInValid,
  type StoredLicenceState,
} from './licence.ts';

export interface LicenceTokenPayload {
  v: 1;
  businessId: string;
  deviceId: string;
  deviceCode: string;
  plan: string;
  state: StoredLicenceState;
  stateChangedAt: string;
  validUntil: string;
  graceDays: number;
  maxOfflineDays: number;
  checkedInAt: string;
}

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;
const STATES: readonly string[] = ['trial', 'active', 'read_only', 'suspended'];

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> {
  const padded = text
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/** Checks the shape of a decoded payload; anything unexpected is rejected. */
export function isLicenceTokenPayload(value: unknown): value is LicenceTokenPayload {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    p.v === 1 &&
    typeof p.businessId === 'string' &&
    typeof p.deviceId === 'string' &&
    typeof p.deviceCode === 'string' &&
    typeof p.plan === 'string' &&
    typeof p.state === 'string' &&
    STATES.includes(p.state) &&
    isIsoDate(p.stateChangedAt) &&
    isIsoDate(p.validUntil) &&
    isIsoDate(p.checkedInAt) &&
    Number.isInteger(p.graceDays) &&
    Number.isInteger(p.maxOfflineDays)
  );
}

export async function importLicencePublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, ALGORITHM, false, ['verify']);
}

export async function importLicencePrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, ALGORITHM, false, ['sign']);
}

export async function signLicenceToken(payload: LicenceTokenPayload, privateKey: CryptoKey): Promise<string> {
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(SIGN, privateKey, new TextEncoder().encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** The payload of a genuine token, or null if it was altered, signed by another key or malformed. */
export async function verifyLicenceToken(
  token: string,
  publicKey: CryptoKey,
): Promise<LicenceTokenPayload | null> {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify(
      SIGN,
      publicKey,
      base64UrlDecode(signature),
      new TextEncoder().encode(body),
    );
    if (!valid) return null;
    const payload: unknown = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
    return isLicenceTokenPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

export interface DeviceLicenceStatus extends LicenceStatus {
  /** The device has been offline longer than the licence allows and must reconnect. */
  needsCheckIn: boolean;
  /** When the device must check in by. */
  checkInBy: Date;
}

/** What this device may do now, from its last token. */
export function deviceLicenceStatus(payload: LicenceTokenPayload, at: Date): DeviceLicenceStatus {
  const checkedInAt = new Date(payload.checkedInAt);
  const status = licenceStatus(
    { state: payload.state, validUntil: new Date(payload.validUntil), graceDays: payload.graceDays },
    at,
  );
  const needsCheckIn = !offlineCheckInValid(checkedInAt, at, payload.maxOfflineDays);
  return {
    ...status,
    canSell: status.canSell && !needsCheckIn,
    canEdit: status.canEdit && !needsCheckIn,
    needsCheckIn,
    checkInBy: new Date(checkedInAt.getTime() + payload.maxOfflineDays * 86_400_000),
  };
}
