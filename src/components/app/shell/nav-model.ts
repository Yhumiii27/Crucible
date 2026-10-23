// Sidebar model (pure): the entries a profile sees, by section and theme, with the active one (derived from Arche's delivery 4b,
// itself Keystone's shell). The Facility section is there for the profiles that see facility sheets: its entries are the tabs
// of the facility open in the URL, else the last one used (`current`); without one they wait for a facility to be chosen.
// Screens of one object (a `[code]` in their path) and screens reached from the header (the bell) are not listed.
import { FACILITY_TABS, FACILITY_TAB_LABEL, facilityTabHref, isFacilityTab, type FacilityTab } from '@/config/facility-tabs';
import type { RoleKey } from '@/config/roles';
import { SCREENS, SECTION_LABEL, canSee, matchScreen, screenHref, type ScreenId, type Section } from '@/config/screens';

export interface NavEntry {
  /** Screen id, or `facility:<tab>`. */
  key: string;
  /** Icon: the screen's, or the facility tab's. */
  icon: ScreenId | `facility:${FacilityTab}`;
  /** EN source string. */
  label: string;
  /** Null: a facility tab while no facility is chosen. */
  href: string | null;
  active: boolean;
}

export interface NavGroup {
  /** EN source string; null for a section without themes. */
  label: string | null;
  entries: NavEntry[];
}

export interface NavSection {
  key: Exclude<Section, 'fixed'>;
  /** EN source string. */
  label: string;
  /** The section holds the active entry. */
  active: boolean;
  groups: NavGroup[];
}

/** The facility code of a facility path ("/facilities/PDE" → "PDE"), else null. */
export function facilityCodeOf(pathname: string): string | null {
  const m = /^\/facilities\/([^/?]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Same tab of another facility; outside a facility sheet, its first tab. */
export function swapFacilityInPath(pathname: string, tab: string | null, code: string): string {
  return facilityTabHref(code, facilityCodeOf(pathname) && isFacilityTab(tab) ? tab : 'resources');
}

export function buildNav(role: RoleKey, pathname: string, tab: string | null = null, current: string | null = null): { fixed: NavEntry[]; sections: NavSection[]; facility: string | null } {
  const active = matchScreen(pathname)?.id ?? null;
  const code = facilityCodeOf(pathname) ?? current;
  const activeTab: FacilityTab = isFacilityTab(tab) ? tab : 'resources';
  const entry = (id: ScreenId, label: string): NavEntry => ({ key: id, icon: id, label, href: screenHref(id), active: id === active });
  const listed = SCREENS.filter((s) => canSee(role, s.id) && s.nav !== false && !s.path.includes('[code]'));
  const fixed = listed.filter((s) => s.section === 'fixed').map((s) => entry(s.id, s.title));
  const sections: NavSection[] = [];
  for (const key of ['planning', 'facility', 'reference', 'steering', 'admin'] as const) {
    if (key === 'facility') {
      if (!canSee(role, 'facility')) continue;
      const onSheet = active === 'facility';
      const entries = FACILITY_TABS.map((t): NavEntry => ({
        key: `facility:${t}`, icon: `facility:${t}`, label: FACILITY_TAB_LABEL[t], href: code ? facilityTabHref(code, t) : null, active: onSheet && t === activeTab,
      }));
      sections.push({ key, label: SECTION_LABEL[key], active: onSheet, groups: [{ label: null, entries }] });
      continue;
    }
    const screens = listed.filter((s) => s.section === key);
    if (!screens.length) continue;
    const groups: NavGroup[] = [];
    for (const s of screens) {
      const label = s.group ?? null;
      let g = groups.find((x) => x.label === label);
      if (!g) groups.push((g = { label, entries: [] }));
      g.entries.push(entry(s.id, s.title));
    }
    sections.push({ key, label: SECTION_LABEL[key], active: screens.some((s) => s.id === active), groups });
  }
  return { fixed, sections, facility: code };
}
