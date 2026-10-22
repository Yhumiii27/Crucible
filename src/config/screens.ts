// Screen registry (docs/spec/05-ecrans.md): id, route, title (EN source string), section of the sidebar, the profiles that
// see it, and the delivery that builds it (a screen not built yet opens the "coming soon" page). Pure: no component, no
// server import, so server code, the proxy and scripts can load it. Icons are in ./screen-icons.ts.
import type { RoleKey } from './roles';

export type ScreenId =
  | 'home' | 'notifications' | 'my-schedule' | 'my-needs'
  | 'planning' | 'load' | 'propose' | 'conflicts' | 'incidents'
  | 'facilities' | 'facility' | 'projects' | 'project' | 'people' | 'rules'
  | 'dashboard'
  | 'admin-org' | 'admin-users' | 'admin-connectors';

export type Section = 'fixed' | 'planning' | 'reference' | 'steering' | 'admin';

export type Delivery = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';

export interface ScreenDef {
  id: ScreenId;
  /** Route pattern; `[code]` is an object code. */
  path: string;
  title: string;
  section: Section;
  /** Profiles that see it; the others get nothing. */
  roles: readonly RoleKey[] | 'all';
  /** Delivery that builds it (docs/PLAN.md). */
  delivery: Delivery;
}

/** Every business profile (all but the administrator, who sees no business data). */
const BUSINESS: readonly RoleKey[] = ['rd_director', 'coordinator', 'safety', 'facility_manager', 'project_lead', 'technician', 'partner', 'viewer'];
const PLANNERS: readonly RoleKey[] = ['rd_director', 'coordinator', 'facility_manager', 'safety'];

export const SCREENS: readonly ScreenDef[] = [
  { id: 'home', path: '/', title: 'Home', section: 'fixed', roles: 'all', delivery: 'L1' },
  { id: 'notifications', path: '/notifications', title: 'Notifications', section: 'fixed', roles: BUSINESS, delivery: 'L5' },
  { id: 'my-schedule', path: '/my/schedule', title: 'My schedule', section: 'fixed', roles: ['coordinator', 'facility_manager', 'technician'], delivery: 'L2' },
  { id: 'my-needs', path: '/my/needs', title: 'My test needs', section: 'fixed', roles: ['project_lead', 'partner'], delivery: 'L3' },
  { id: 'planning', path: '/planning', title: 'Resource planning', section: 'planning', roles: BUSINESS, delivery: 'L2' },
  { id: 'load', path: '/load', title: 'Load forecast', section: 'planning', roles: PLANNERS, delivery: 'L3' },
  { id: 'propose', path: '/propose', title: 'Slot proposals', section: 'planning', roles: ['rd_director', 'coordinator'], delivery: 'L4' },
  { id: 'conflicts', path: '/conflicts', title: 'Conflicts & arbitration', section: 'planning', roles: ['rd_director', 'coordinator', 'safety'], delivery: 'L4' },
  { id: 'incidents', path: '/incidents', title: 'Incidents & scenarios', section: 'planning', roles: BUSINESS, delivery: 'L5' },
  { id: 'facilities', path: '/facilities', title: 'Facilities', section: 'reference', roles: BUSINESS, delivery: 'L1' },
  { id: 'facility', path: '/facilities/[code]', title: 'Facility', section: 'reference', roles: BUSINESS, delivery: 'L2' },
  { id: 'projects', path: '/projects', title: 'Projects', section: 'reference', roles: ['rd_director', 'coordinator', 'safety', 'facility_manager', 'project_lead', 'partner', 'viewer'], delivery: 'L1' },
  { id: 'project', path: '/projects/[code]', title: 'Project', section: 'reference', roles: ['rd_director', 'coordinator', 'safety', 'facility_manager', 'project_lead', 'partner', 'viewer'], delivery: 'L3' },
  { id: 'people', path: '/people', title: 'People & skills', section: 'reference', roles: ['rd_director', 'coordinator', 'facility_manager', 'safety'], delivery: 'L4' },
  { id: 'rules', path: '/rules', title: 'Rules', section: 'reference', roles: PLANNERS, delivery: 'L2' },
  { id: 'dashboard', path: '/dashboard', title: 'Utilisation dashboard', section: 'steering', roles: [...PLANNERS, 'partner'], delivery: 'L2' },
  { id: 'admin-org', path: '/admin/organisation', title: 'Entities, sites, facilities, projects', section: 'admin', roles: ['admin', 'rd_director'], delivery: 'L1' },
  { id: 'admin-users', path: '/admin/users', title: 'Users & roles', section: 'admin', roles: ['admin'], delivery: 'L1' },
  { id: 'admin-connectors', path: '/admin/connectors', title: 'Connectors', section: 'admin', roles: ['admin'], delivery: 'L3' },
];

export const SCREEN_BY_ID = Object.fromEntries(SCREENS.map((s) => [s.id, s])) as Record<ScreenId, ScreenDef>;

/** Section titles (EN source strings). */
export const SECTION_LABEL: Record<Exclude<Section, 'fixed'>, string> = {
  planning: 'Planning',
  reference: 'Reference',
  steering: 'Steering',
  admin: 'Administration',
};

/** Screens built so far (the others open the "coming soon" page). */
export const BUILT: ReadonlySet<ScreenId> = new Set(SCREENS.filter((s) => s.delivery !== 'L6').map((s) => s.id));

/** True when the profile has the screen in its workspace. */
export function canSee(role: RoleKey, id: ScreenId): boolean {
  const r = SCREEN_BY_ID[id].roles;
  return r === 'all' || r.includes(role);
}

/** The URL of a screen (`code` for the screens of one object). */
export function screenHref(id: ScreenId, params: { code?: string } = {}): string {
  const p = SCREEN_BY_ID[id].path;
  if (!p.includes('[code]')) return p;
  if (!params.code) throw new Error(`screenHref(${id}) needs a code`);
  return p.replace('[code]', encodeURIComponent(params.code));
}

/** The screen a path shows (most specific pattern first), or null. */
export function matchScreen(pathname: string): ScreenDef | null {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const byLength = [...SCREENS].sort((a, b) => b.path.length - a.path.length);
  for (const s of byLength) {
    const re = new RegExp('^' + s.path.replace(/\[code\]/, '[^/]+').replace(/\//g, '\\/') + '(\\/.*)?$');
    if (s.path === '/' ? clean === '/' : re.test(clean)) return s;
  }
  return null;
}
