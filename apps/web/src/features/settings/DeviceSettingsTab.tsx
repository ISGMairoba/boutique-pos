import { type DeviceSettings, defaultDeviceSettings, parseDeviceSettings } from '@boutique/domain';
import { Button, FieldHint, Input, Label, Notice, Select } from '@boutique/ui';
import { useEffect, useId, useState } from 'react';
import type { Business } from '../../lib/business.ts';
import { getDeviceId } from '../../lib/device.ts';
import { errorMessage, supabase } from '../../lib/supabase.ts';

const savedKey = (businessId: string) => `boutique.device-settings.${businessId}`;

/** Device settings saved on this device too, so printing works offline. */
export function savedDeviceSettings(businessId: string): DeviceSettings {
  try {
    return parseDeviceSettings(JSON.parse(localStorage.getItem(savedKey(businessId)) ?? 'null'));
  } catch {
    return defaultDeviceSettings();
  }
}

export function DeviceSettingsTab({
  business,
  deviceCode,
  onPaperChange,
}: {
  business: Business;
  deviceCode: string | null;
  onPaperChange: (width: 58 | 80) => void;
}) {
  const ids = { name: useId(), paper: useId(), copies: useId(), lock: useId(), auto: useId() };
  const [name, setName] = useState('');
  const [settings, setSettings] = useState<DeviceSettings>(() => savedDeviceSettings(business.id));
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const canEdit = (business.rank ?? 0) >= 2;

  useEffect(() => {
    if (!supabase || !deviceCode) return;
    supabase
      .from('devices')
      .select('name, settings')
      .eq('id', getDeviceId())
      .eq('business_id', business.id)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (loadError) setError(errorMessage(loadError));
        if (data) {
          setName(data.name);
          const parsed = parseDeviceSettings(data.settings);
          setSettings(parsed);
          onPaperChange(parsed.paperWidth);
          try {
            localStorage.setItem(savedKey(business.id), JSON.stringify(parsed));
          } catch {
            // Saved copy is a convenience for offline printing.
          }
        }
        setLoaded(true);
      });
  }, [business.id, deviceCode, onPaperChange]);

  if (business.rank === null) {
    return (
      <Notice>
        Device settings belong to each shop device. Open the business on a shop device to change them.
      </Notice>
    );
  }
  if (!deviceCode) {
    return (
      <Notice>This device is not registered yet. Open the Overview tab while online to register it.</Notice>
    );
  }

  const update = (next: Partial<DeviceSettings>) => {
    setDone('');
    setSettings((current) => ({ ...current, ...next }));
    if (next.paperWidth) onPaperChange(next.paperWidth);
  };

  async function save() {
    if (!supabase) return;
    setBusy(true);
    setError('');
    setDone('');
    const { error: saveError } = await supabase.rpc('save_device_settings', {
      p_business: business.id,
      p_device: getDeviceId(),
      p_name: name,
      p_settings: { ...settings },
    });
    setBusy(false);
    if (saveError) {
      setError(errorMessage(saveError));
      return;
    }
    try {
      localStorage.setItem(savedKey(business.id), JSON.stringify(settings));
    } catch {
      // Saved copy is a convenience for offline printing.
    }
    setDone('Device settings saved.');
  }

  return (
    <div className="grid max-w-xl gap-4">
      <p className="text-sm text-muted-foreground">
        These apply to this device only: device {business.receiptPrefix}-{deviceCode}.
        {!canEdit && ' Only an Admin or Manager can change them.'}
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor={ids.name}>Device name</Label>
        <Input
          id={ids.name}
          maxLength={60}
          value={name}
          disabled={!canEdit || !loaded}
          onChange={(e) => {
            setDone('');
            setName(e.target.value);
          }}
        />
        <FieldHint>For example: Front till, Owner's phone.</FieldHint>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={ids.paper}>Receipt paper</Label>
          <Select
            id={ids.paper}
            value={settings.paperWidth}
            disabled={!canEdit}
            onChange={(e) => update({ paperWidth: e.target.value === '58' ? 58 : 80 })}
          >
            <option value={80}>80 mm (most counter printers)</option>
            <option value={58}>58 mm (small and mobile printers)</option>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={ids.copies}>Copies</Label>
          <Select
            id={ids.copies}
            value={settings.copies}
            disabled={!canEdit}
            onChange={(e) => update({ copies: Number(e.target.value) })}
          >
            <option value={1}>1 copy</option>
            <option value={2}>2 copies</option>
            <option value={3}>3 copies</option>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={ids.lock}>Lock the till after</Label>
          <Select
            id={ids.lock}
            value={settings.autoLockMinutes}
            disabled={!canEdit}
            onChange={(e) => update({ autoLockMinutes: Number(e.target.value) })}
          >
            {[0, 2, 5, 10, 15, 30, 60].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 0 ? 'Never' : `${minutes} minutes without use`}
              </option>
            ))}
          </Select>
        </div>
        <label htmlFor={ids.auto} className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            id={ids.auto}
            type="checkbox"
            checked={settings.autoPrint}
            disabled={!canEdit}
            onChange={(e) => update({ autoPrint: e.target.checked })}
          />
          Print a receipt after every sale
        </label>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      {done && <Notice tone="success">{done}</Notice>}
      {canEdit && (
        <div>
          <Button onClick={save} disabled={busy || !loaded || !name.trim()}>
            {busy ? 'Saving…' : 'Save device settings'}
          </Button>
        </div>
      )}
    </div>
  );
}
