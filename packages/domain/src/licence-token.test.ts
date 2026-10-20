import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  base64UrlDecode,
  base64UrlEncode,
  deviceLicenceStatus,
  importLicencePrivateKey,
  importLicencePublicKey,
  type LicenceTokenPayload,
  signLicenceToken,
  verifyLicenceToken,
} from './licence-token.ts';

const payload: LicenceTokenPayload = {
  v: 1,
  businessId: 'b1',
  deviceId: 'd1',
  deviceCode: '01',
  plan: 'starter',
  state: 'active',
  stateChangedAt: '2026-10-01T00:00:00.000Z',
  validUntil: '2026-11-01T00:00:00.000Z',
  graceDays: 7,
  maxOfflineDays: 7,
  checkedInAt: '2026-10-21T08:00:00.000Z',
};

async function keyPair() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return {
    privateKey: await importLicencePrivateKey(privateJwk),
    publicKey: await importLicencePublicKey(publicJwk),
  };
}

test('base64url round-trips bytes', () => {
  const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
  const text = base64UrlEncode(bytes);
  assert.doesNotMatch(text, /[+/=]/);
  assert.deepEqual(base64UrlDecode(text), bytes);
});

test('a signed token verifies and returns its payload', async () => {
  const { privateKey, publicKey } = await keyPair();
  const token = await signLicenceToken(payload, privateKey);
  assert.deepEqual(await verifyLicenceToken(token, publicKey), payload);
});

test('an altered token is rejected', async () => {
  const { privateKey, publicKey } = await keyPair();
  const token = await signLicenceToken(payload, privateKey);
  const [, signature] = token.split('.');
  const forged = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ ...payload, validUntil: '2030-01-01T00:00:00.000Z' })),
  );
  assert.equal(await verifyLicenceToken(`${forged}.${signature}`, publicKey), null);
  assert.equal(await verifyLicenceToken('not-a-token', publicKey), null);
  assert.equal(await verifyLicenceToken(`${token}.extra`, publicKey), null);
});

test('a token signed by another key is rejected', async () => {
  const first = await keyPair();
  const second = await keyPair();
  const token = await signLicenceToken(payload, first.privateKey);
  assert.equal(await verifyLicenceToken(token, second.publicKey), null);
});

test('a malformed payload is rejected even when signed', async () => {
  const { privateKey, publicKey } = await keyPair();
  const token = await signLicenceToken(
    { ...payload, state: 'unlimited' } as unknown as LicenceTokenPayload,
    privateKey,
  );
  assert.equal(await verifyLicenceToken(token, publicKey), null);
});

test('device status combines the licence with the offline check-in limit', () => {
  const soon = deviceLicenceStatus(payload, new Date('2026-10-25T08:00:00.000Z'));
  assert.deepEqual([soon.state, soon.canSell, soon.needsCheckIn], ['active', true, false]);
  assert.equal(soon.checkInBy.toISOString(), '2026-10-28T08:00:00.000Z');

  const stale = deviceLicenceStatus(payload, new Date('2026-10-29T08:00:00.000Z'));
  assert.deepEqual([stale.state, stale.canSell, stale.needsCheckIn], ['active', false, true]);

  const suspended = deviceLicenceStatus(
    { ...payload, state: 'suspended' },
    new Date('2026-10-22T00:00:00.000Z'),
  );
  assert.deepEqual([suspended.canSell, suspended.canSignIn], [false, false]);
});
