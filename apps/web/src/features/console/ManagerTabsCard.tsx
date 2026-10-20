import { SETTINGS_TABS, type SettingsTab } from '@boutique/domain';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Notice } from '@boutique/ui';
import { useEffect, useState } from 'react';
import { errorMessage, supabase } from '../../lib/supabase.ts';

const LABEL: Record<SettingsTab, string> = {
  brand: 'Brand: name, colour and logo',
  terminology: 'Wording',
  receipt: 'Receipt text and layout',
  channels: 'Sales channels',
  payments: 'Payment methods',
};

/** Platform developer: which settings tabs this business's Managers may change themselves. */
export function ManagerTabsCard({ businessId, onSaved }: { businessId: string; onSaved: () => void }) {
  const [saved, setSaved] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('business_settings')
      .select('manager_editable')
      .eq('business_id', businessId)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (loadError) setError(errorMessage(loadError));
        const tabs = data?.manager_editable ?? [];
        setSaved(tabs);
        setChosen(tabs);
      });
  }, [businessId]);

  const changed = saved !== null && [...chosen].sort().join() !== [...saved].sort().join();

  async function save() {
    if (!supabase) return;
    setBusy(true);
    setError('');
    setDone(false);
    const { error: saveError } = await supabase.rpc('console_set_manager_editable', {
      p_business: businessId,
      p_tabs: chosen,
    });
    setBusy(false);
    if (saveError) {
      setError(errorMessage(saveError));
      return;
    }
    setSaved(chosen);
    setDone(true);
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>What Managers may change</CardTitle>
        <CardDescription>
          You can always change every setting. Features stay yours. Admins and Cashiers can change only their
          device.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {saved === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
        {saved !== null && (
          <fieldset className="grid gap-2 text-sm">
            <legend className="sr-only">Settings Managers may change</legend>
            {SETTINGS_TABS.map((tab) => (
              <label key={tab} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={chosen.includes(tab)}
                  onChange={(e) => {
                    setDone(false);
                    setChosen((current) =>
                      e.target.checked ? [...current, tab] : current.filter((t) => t !== tab),
                    );
                  }}
                />
                {LABEL[tab]}
              </label>
            ))}
          </fieldset>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        {done && (
          <Notice tone="success">Saved. Managers see the change the next time they open settings.</Notice>
        )}
        <div>
          <Button size="sm" onClick={save} disabled={!changed || busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
