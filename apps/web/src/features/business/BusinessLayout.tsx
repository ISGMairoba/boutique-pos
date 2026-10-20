import { Notice } from '@boutique/ui';
import { useEffect } from 'react';
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router';
import { applyBrand, resetBrand } from '../../app/theme.ts';
import { type Business, brandAssetUrl, useBusiness } from '../../lib/business.ts';
import { LicenceBadge } from '../licence/LicenceBadge.tsx';
import { type DeviceLicenceState, useDeviceLicence } from '../licence/useDeviceLicence.ts';

export interface BusinessContext {
  business: Business;
  /** Whether the copy shown came from this device rather than the server. */
  saved: boolean;
  reload: () => Promise<void>;
  licence: DeviceLicenceState;
  isDeveloper: boolean;
}

export function useBusinessContext(): BusinessContext {
  return useOutletContext<BusinessContext>();
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:text-foreground'}`;

/** Loads a business once for all of its screens, applies its brand and checks this device in. */
export function BusinessLayout({ userId, isDeveloper }: { userId: string; isDeveloper: boolean }) {
  const { businessId = '' } = useParams();
  const load = useBusiness(businessId, userId);
  const business = load.status === 'ready' ? load.business : null;
  const licence = useDeviceLicence(businessId, business ? business.rank !== null : false);
  const colour = business?.settings.brand.colour;

  useEffect(() => {
    if (!colour) return;
    try {
      applyBrand(colour);
    } catch {
      // A colour the palette builder refuses leaves the product's own colours in place.
    }
    return resetBrand;
  }, [colour]);

  if (load.status === 'loading') return <p className="text-sm text-muted-foreground">Opening business…</p>;
  if (load.status === 'error') {
    return (
      <section className="grid gap-4">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← All businesses
        </Link>
        <Notice tone="danger">{load.message}</Notice>
      </section>
    );
  }

  const { business: current } = load;
  const logo = brandAssetUrl(current.settings.brand.logo?.screen);
  const canOpenSettings = isDeveloper || (current.rank ?? 0) >= 2;
  const context: BusinessContext = {
    business: current,
    saved: load.saved,
    reload: load.reload,
    licence,
    isDeveloper,
  };

  return (
    <section className="grid gap-5">
      <Link
        to={isDeveloper && current.rank === null ? '/console' : '/'}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← {isDeveloper && current.rank === null ? 'Developer console' : 'All businesses'}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        {logo && <img src={logo} alt="" className="h-10 max-w-32 object-contain" />}
        <h1 className="text-2xl font-semibold">{current.name}</h1>
        <LicenceBadge state={licence.licence?.status.state} />
      </div>
      <nav className="-mt-2 flex flex-wrap gap-1" aria-label="Business">
        <NavLink end to={`/b/${current.id}`} className={tabClass}>
          Overview
        </NavLink>
        {canOpenSettings && (
          <NavLink to={`/b/${current.id}/settings`} className={tabClass}>
            Settings
          </NavLink>
        )}
      </nav>
      <Outlet context={context} />
    </section>
  );
}
