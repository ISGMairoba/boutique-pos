import type { LicenceState } from '@boutique/domain';

export const licenceStateLabel: Record<LicenceState, string> = {
  trial: 'Trial',
  active: 'Active',
  grace: 'Payment overdue',
  read_only: 'Read-only',
  suspended: 'Suspended',
};

export const licenceStateTone: Record<LicenceState, 'primary' | 'success' | 'warning' | 'danger'> = {
  trial: 'primary',
  active: 'success',
  grace: 'warning',
  read_only: 'danger',
  suspended: 'danger',
};

export function isLicenceState(value: string): value is LicenceState {
  return value in licenceStateLabel;
}

export function formatDate(value: string | Date, locale = 'en-NG', timeZone = 'Africa/Lagos'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(new Date(value));
}

export function formatDateTime(value: string | Date, locale = 'en-NG', timeZone = 'Africa/Lagos'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(
    new Date(value),
  );
}
