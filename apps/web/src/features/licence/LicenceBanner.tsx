import { Notice } from '@boutique/ui';
import type { DeviceLicence } from '../../lib/licence.ts';
import { formatDate } from './labels.ts';

/** Tells staff, in plain words, what the licence lets them do right now. Nothing when all is well. */
export function LicenceBanner({
  licence,
  locale,
  timeZone,
}: {
  licence: DeviceLicence;
  locale: string;
  timeZone: string;
}) {
  const { status } = licence;
  const date = (value: Date) => formatDate(value, locale, timeZone);

  if (status.needsCheckIn) {
    return (
      <Notice tone="danger">
        This device has been offline since {date(new Date(licence.payload.checkedInAt))}. Connect to the
        internet to keep selling.
      </Notice>
    );
  }
  switch (status.state) {
    case 'suspended':
      return (
        <Notice tone="danger">
          This business is suspended and staff cannot sell. Contact your installer.
        </Notice>
      );
    case 'read_only':
      return (
        <Notice tone="danger">
          Selling is paused because the licence has ended. You can still look at your records. Ask your
          installer to renew it.
        </Notice>
      );
    case 'grace':
      return (
        <Notice tone="warning">
          The licence ended on {date(new Date(licence.payload.validUntil))}. Selling stops on{' '}
          {date(status.graceEndsAt)} unless it is renewed.
        </Notice>
      );
    default:
      if (status.daysLeft <= 7) {
        return (
          <Notice tone="warning">
            {status.state === 'trial' ? 'The trial' : 'The licence'} ends on{' '}
            {date(new Date(licence.payload.validUntil))} ({status.daysLeft} day
            {status.daysLeft === 1 ? '' : 's'} left).
          </Notice>
        );
      }
      return null;
  }
}
