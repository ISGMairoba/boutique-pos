// This browser's identity as a till. The id is created once and kept in local storage; clearing the
// site's data makes the browser a new device that must be registered again.

const DEVICE_KEY = 'boutique.device';
let memoryId: string | null = null;

export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    // Storage unavailable (private window): keep an id for this visit only.
    memoryId ??= crypto.randomUUID();
    return memoryId;
  }
}

/** A starting name for this device, such as "Chrome on Windows" or "Safari on iPhone". */
export function defaultDeviceName(): string {
  const agent = navigator.userAgent;
  const system = /iPhone/.test(agent)
    ? 'iPhone'
    : /iPad/.test(agent)
      ? 'iPad'
      : /Android/.test(agent)
        ? 'Android'
        : /Windows/.test(agent)
          ? 'Windows'
          : /Mac OS X/.test(agent)
            ? 'Mac'
            : /Linux/.test(agent)
              ? 'Linux'
              : 'this device';
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /Chrome\//.test(agent)
      ? 'Chrome'
      : /Firefox\//.test(agent)
        ? 'Firefox'
        : /Safari\//.test(agent)
          ? 'Safari'
          : 'Browser';
  return `${browser} on ${system}`;
}
