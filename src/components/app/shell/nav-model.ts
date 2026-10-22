// Sidebar model (pure): the entries a profile sees, by section, with the active one. Screens not built yet are listed too —
// they open the "coming soon" page. Screens of one object (a `[code]` in their path) are reached from their list, not listed.
import type { RoleKey } from '@/config/roles';
import { SCREENS, SECTION_LABEL, canSee, matchScreen, screenHref, type ScreenId, type Section } from '@/config/screens';

export interface NavEntry {
  id: ScreenId;
  /** EN source string. */
  label: string;
  href: string;
  active: boolean;
}

export interface NavSection {
  key: Exclude<Section, 'fixed'>;
  /** EN source string. */
  label: string;
  /** Typed text under the section title (none yet). */
  sub: string | null;
  entries: NavEntry[];
}

export function buildNav(role: RoleKey, pathname: string): { fixed: NavEntry[]; sections: NavSection[] } {
  const active = matchScreen(pathname)?.id ?? null;
  const entry = (id: ScreenId, label: string): NavEntry => ({ id, label, href: screenHref(id), active: id === active });
  const visible = SCREENS.filter((s) => canSee(role, s.id) && !s.path.includes('[code]'));
  const fixed = visible.filter((s) => s.section === 'fixed').map((s) => entry(s.id, s.title));
  const sections: NavSection[] = [];
  for (const key of ['planning', 'reference', 'steering', 'admin'] as const) {
    const entries = visible.filter((s) => s.section === key).map((s) => entry(s.id, s.title));
    if (entries.length) sections.push({ key, label: SECTION_LABEL[key], sub: null, entries });
  }
  return { fixed, sections };
}
