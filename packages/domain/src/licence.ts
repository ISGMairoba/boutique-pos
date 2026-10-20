// Licence rules shared by the app and mirrored in SQL by public.licence_state_at().
// Stored states are trial, active, read_only and suspended. Grace is never stored: it is the
// window of grace_days after valid_until, after which an unpaid licence becomes read-only.

export const STORED_LICENCE_STATES = ['trial', 'active', 'read_only', 'suspended'] as const;
export type StoredLicenceState = (typeof STORED_LICENCE_STATES)[number];
export type LicenceState = StoredLicenceState | 'grace';

export interface Licence {
  state: StoredLicenceState;
  validUntil: Date;
  graceDays: number;
}

export interface LicenceStatus {
  state: LicenceState;
  /** New sales may be recorded. */
  canSell: boolean;
  /** Records may be changed (catalogue, stock, settings). */
  canEdit: boolean;
  /** Staff may sign in. */
  canSignIn: boolean;
  /** When the grace window ends. */
  graceEndsAt: Date;
  /** Whole days until the next step down (0 when already read-only or suspended). */
  daysLeft: number;
}

const DAY_MS = 86_400_000;

/** The licence state at a moment, matching public.licence_state_at() in the database. */
export function licenceStateAt(licence: Licence, at: Date): LicenceState {
  if (licence.state === 'suspended' || licence.state === 'read_only') return licence.state;
  if (at.getTime() <= licence.validUntil.getTime()) return licence.state;
  if (at.getTime() <= graceEnd(licence).getTime()) return 'grace';
  return 'read_only';
}

export function licenceStatus(licence: Licence, at: Date): LicenceStatus {
  const state = licenceStateAt(licence, at);
  const active = state === 'trial' || state === 'active' || state === 'grace';
  const nextStep = state === 'grace' ? graceEnd(licence) : licence.validUntil;
  return {
    state,
    canSell: active,
    canEdit: active,
    canSignIn: state !== 'suspended',
    graceEndsAt: graceEnd(licence),
    daysLeft: active ? Math.max(0, Math.ceil((nextStep.getTime() - at.getTime()) / DAY_MS)) : 0,
  };
}

/**
 * Whether a device may keep working on its cached licence. A device that has not checked in with
 * the server for more than maxOfflineDays must reconnect before it can sell again.
 */
export function offlineCheckInValid(lastCheckIn: Date, at: Date, maxOfflineDays: number): boolean {
  return at.getTime() - lastCheckIn.getTime() <= maxOfflineDays * DAY_MS;
}

function graceEnd(licence: Licence): Date {
  return new Date(licence.validUntil.getTime() + licence.graceDays * DAY_MS);
}
