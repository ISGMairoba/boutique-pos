// Reports group sales by the business's own calendar day, in its time zone, never the device's.

/** The business day ("YYYY-MM-DD") of an instant in a time zone. */
export function businessDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Minutes a time zone is ahead of UTC at an instant (Africa/Lagos: 60). */
export function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** The last second of a business day ("YYYY-MM-DD") in a time zone, as an instant. */
export function endOfBusinessDay(day: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new RangeError(`Use a date like 2026-12-31, not "${day}"`);
  const [, y, m, d] = match;
  const localEnd = Date.UTC(Number(y), Number(m) - 1, Number(d), 23, 59, 59);
  // Two passes handle a day on which the zone's offset changes.
  let instant = localEnd - timeZoneOffsetMinutes(new Date(localEnd), timeZone) * 60_000;
  instant = localEnd - timeZoneOffsetMinutes(new Date(instant), timeZone) * 60_000;
  return new Date(instant);
}

/** Whether a string names a time zone this runtime understands. */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
