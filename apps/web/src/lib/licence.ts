import {
  type DeviceLicenceStatus,
  deviceLicenceStatus,
  importLicencePublicKey,
  type LicenceTokenPayload,
  verifyLicenceToken,
} from '@boutique/domain';
import { defaultDeviceName, getDeviceId } from './device.ts';
import { licencePublicKey } from './env.ts';
import { callFunction } from './functions.ts';

const tokenKey = (businessId: string) => `boutique.licence.${businessId}`;
let keyPromise: Promise<CryptoKey> | null = null;

function publicKey(): Promise<CryptoKey> {
  if (!licencePublicKey) return Promise.reject(new Error('This build has no licence key configured.'));
  keyPromise ??= importLicencePublicKey(licencePublicKey);
  return keyPromise;
}

async function verifyFor(businessId: string, token: string): Promise<LicenceTokenPayload | null> {
  const payload = await verifyLicenceToken(token, await publicKey());
  if (!payload || payload.businessId !== businessId || payload.deviceId !== getDeviceId()) return null;
  return payload;
}

/** Registers this device if needed, checks in, and keeps the signed token for offline use. */
export async function checkIn(businessId: string): Promise<LicenceTokenPayload> {
  const { token } = await callFunction<{ token: string }>('licence-token', {
    businessId,
    deviceId: getDeviceId(),
    deviceName: defaultDeviceName(),
  });
  const payload = await verifyFor(businessId, token);
  if (!payload) throw new Error('The licence from the server could not be checked. Try again.');
  try {
    localStorage.setItem(tokenKey(businessId), token);
  } catch {
    // Without storage the licence lasts for this visit only.
  }
  return payload;
}

/** The last licence this device received for a business, if it is still genuine. */
export async function cachedLicence(businessId: string): Promise<LicenceTokenPayload | null> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(tokenKey(businessId));
  } catch {
    return null;
  }
  return token ? verifyFor(businessId, token) : null;
}

export interface DeviceLicence {
  payload: LicenceTokenPayload;
  status: DeviceLicenceStatus;
  /** Whether this came from the server just now or from the copy saved on this device. */
  source: 'server' | 'saved';
}

export function describe(payload: LicenceTokenPayload, source: DeviceLicence['source']): DeviceLicence {
  return { payload, status: deviceLicenceStatus(payload, new Date()), source };
}
