import type { LicenceState } from '@boutique/domain';
import { Badge } from '@boutique/ui';
import { isLicenceState, licenceStateLabel, licenceStateTone } from './labels.ts';

export function LicenceBadge({ state }: { state: LicenceState | string | null | undefined }) {
  if (!state || !isLicenceState(state)) return <Badge>No licence</Badge>;
  return <Badge tone={licenceStateTone[state]}>{licenceStateLabel[state]}</Badge>;
}
