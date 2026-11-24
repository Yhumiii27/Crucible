'use client';
// Sidebar (derived from Keystone's shell through Arche's delivery 4b, docs/spec/05): brand, page search (⌘K), fixed entries,
// then the Planning, Facility, Reference, Steering and Administration sections — collapsible (cookie crucible-nav), their
// entries grouped by theme, with counts (decisions waiting, open proposals and conflicts, inspections due). The Facility section
// holds the facility switcher (Keystone's project switcher: my facilities / all I see, search); its entries are the tabs of the
// facility of the URL, else the last one used (cookie crucible-facility). At the bottom the "View as" switcher (demo mode) or
// the account menu (Entra mode). Rendered with the charte's components (Norma 2.0, charte/COQUE.md § 2: Sidebar, PageSearch,
// NavList, NavSection, NavEntry; classes of coque.css). The language / display pair and the bell are in the page header.
import { Buildings, CalendarX, CurrencyEur, Package, Plugs, CaretDown, CaretUpDown, Check, Eye, Flask, Gauge, ListChecks, MagnifyingGlass, Polygon, SealCheck, SignOut, Toolbox, Wrench } from '@phosphor-icons/react/dist/ssr';
import type { Icon } from '@phosphor-icons/react';
import { useCoque } from '@norma/charte/ds/AppShell';
import { Sidebar as CoqueSidebar, NavEntry as NavEntryLink, NavList, NavSection, NavSections, PageSearch, type PageHit } from '@norma/charte/ds/Sidebar';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@/components/ds/cx';
import { Segmented } from '@/components/ds/Segmented';
import { ROLE_LABEL, type RoleKey } from '@/config/roles';
import { SCREEN_ICONS } from '@/config/screen-icons';
import { AUTH_PATHS } from '@/domain/auth';
import { useI18n } from '@/i18n/client';
import { setViewAs, switchRole } from '@/server/actions/preferences';
import { buildNav, swapFacilityInPath, type NavEntry } from './nav-model';
import picker from './header.module.css';
import styles from './sidebar.module.css';

export interface SidebarPersona {
  role: RoleKey;
  name: string;
  initials: string;
}

export interface SidebarAccount {
  name: string;
  initials: string;
  role: RoleKey;
  roles: RoleKey[];
}

/** A facility of the switcher, labels already displayed (typed text shown as typed). */
export interface FacilityOption {
  code: string;
  name: string;
  /** "EPC2I · 3 resources". */
  sub: string;
  /** A facility the viewer manages or coordinates. */
  mine: boolean;
}

export interface SidebarProps {
  role: RoleKey;
  /** Demo mode: one persona per profile. */
  personas: SidebarPersona[];
  /** Entra mode: the signed-in user. */
  account: SidebarAccount | null;
  /** The facilities the viewer sees. */
  facilities: FacilityOption[];
  /** Last facility used (cookie crucible-facility), if still visible. */
  lastFacility: string | null;
  /** Sections folded by the viewer (cookie crucible-nav). */
  folded: string[];
  /** Counts next to an entry, by entry key. */
  badges?: Partial<Record<string, number>>;
}

const TAB_ICONS: Record<string, Icon> = { 'facility:resources': Flask, 'facility:calendar': CalendarX, 'facility:inspections': SealCheck, 'facility:maintenance': Wrench, 'facility:forms': ListChecks, 'facility:equipment': Toolbox, 'facility:measurement': Gauge, 'facility:api': Plugs, 'facility:rates': CurrencyEur, 'facility:consumables': Package };

const YEAR = 60 * 60 * 24 * 365;
const setCookie = (name: string, value: string) => {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${YEAR}; samesite=lax`;
};

/** Closes a popover on an outside click and on Escape. */
function useDismiss(open: boolean, setOpen: (v: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);
  return ref;
}

export function Sidebar({ role, personas, account, facilities, lastFacility, folded: initialFolded, badges = {} }: SidebarProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const tab = useSearchParams().get('tab');
  const known = new Set(facilities.map((c) => c.code));
  // Without a facility in the URL: the last one used, else the viewer's first own facility, else the first one they see.
  const fallback = (lastFacility && known.has(lastFacility) ? lastFacility : null) ?? facilities.find((c) => c.mine)?.code ?? facilities[0]?.code ?? null;
  const nav = buildNav(role, pathname, tab, fallback);
  const [folded, setFolded] = useState<string[]>(initialFolded);

  // The facility of the URL becomes the last one used.
  useEffect(() => {
    if (nav.facility && known.has(nav.facility) && nav.facility !== lastFacility) setCookie('crucible-facility', nav.facility);
  });

  const toggle = (key: string) => {
    const next = folded.includes(key) ? folded.filter((k) => k !== key) : [...folded, key];
    setFolded(next);
    setCookie('crucible-nav', next.join(','));
  };

  const iconOf = (n: NavEntry): Icon => TAB_ICONS[n.icon] ?? SCREEN_ICONS[n.icon as keyof typeof SCREEN_ICONS] ?? Eye;
  // Every page the viewer may open, for the ⌘K page search (a facility tab without a facility chosen is not one).
  const pages: PageHit[] = useMemo(
    () => [
      ...nav.fixed.map((e) => ({ e, section: undefined as string | undefined })),
      ...nav.sections.flatMap((sec) => sec.groups.flatMap((g) => g.entries.map((e) => ({ e, section: t(sec.label) })))),
    ]
      .filter(({ e }) => e.href)
      .map(({ e, section }) => ({ href: e.href!, label: t(e.label), section, icon: iconOf(e), badge: badges[e.key] || undefined })),
    [nav, t, badges],
  );
  const sectionBadge = (sec: (typeof nav.sections)[number]) => sec.groups.reduce((n, g) => n + g.entries.reduce((m, e) => m + (badges[e.key] ?? 0), 0), 0);

  const entry = (n: NavEntry, item: boolean) =>
    n.href ? (
      <NavEntryLink key={n.key} href={n.href} label={t(n.label)} icon={iconOf(n)} active={n.active} badge={badges[n.key] || undefined} item={item} />
    ) : (
      // A facility tab while no facility is chosen: shown, not a link.
      <span key={n.key} className={cx('coque-entry', item && 'is-item', styles.disabled)} aria-disabled="true" title={t('Choose a facility first')}>
        {(() => {
          const I = iconOf(n);
          return <I size={16} className="coque-entry-icon" aria-hidden />;
        })()}
        <span className="coque-entry-label">{t(n.label)}</span>
      </span>
    );

  return (
    <CoqueSidebar name="Crucible" icon={Polygon} footer={account ? <AccountMenu account={account} /> : <ViewAs role={role} personas={personas} />}>
      <PageSearch pages={pages}>
        <NavList>{nav.fixed.map((n) => entry(n, false))}</NavList>
        <NavSections>
          {nav.sections.map((sec) => {
            const open = !folded.includes(sec.key) || sec.active;
            const badge = sectionBadge(sec);
            return (
              <NavSection
                key={sec.key}
                label={t(sec.label)}
                open={open}
                onToggle={() => toggle(sec.key)}
                bright={sec.active}
                badge={!open && badge ? badge : undefined}
                count={!open && !badge ? sec.groups.reduce((n, g) => n + g.entries.length, 0) : undefined}
              >
                {sec.key === 'facility' && <FacilitySwitcher options={facilities} current={nav.facility} />}
                {sec.groups.map((g) => (
                  <div key={g.label ?? '-'} className={styles.groupBlock}>
                    {g.label && (
                      <div className="coque-group" role="presentation">
                        <span>{t(g.label)}</span>
                        <span className="coque-group-rule" />
                      </div>
                    )}
                    {g.entries.map((n) => entry(n, true))}
                  </div>
                ))}
              </NavSection>
            );
          })}
        </NavSections>
      </PageSearch>
    </CoqueSidebar>
  );
}

/** Facility switcher (Keystone's project switcher): my facilities or all I see, search, the same tab of the chosen facility. */
function FacilitySwitcher({ options, current }: { options: FacilityOption[]; current: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const tab = useSearchParams().get('tab');
  const [open, setOpen] = useState(false);
  const mineCount = options.filter((o) => o.mine).length;
  const [scope, setScope] = useState<'mine' | 'all'>(mineCount ? 'mine' : 'all');
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({});
  const { closeNav } = useCoque();
  // The menu is wider than the sidebar: it opens in a layer of the page, next to the button.
  useEffect(() => {
    if (!open) return;
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ position: 'fixed', top: r.bottom + 4, left: r.left, width: 400, maxHeight: `calc(100vh - ${Math.round(r.bottom) + 16}px)`, overflow: 'auto' });
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!ref.current?.contains(n) && !menuRef.current?.contains(n)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (!options.length) return null;
  const cur = options.find((o) => o.code === current) ?? null;
  const query = q.trim().toLowerCase();
  const shown = options.filter((o) => (query ? `${o.code} ${o.name} ${o.sub}`.toLowerCase().includes(query) : scope === 'all' || o.mine));
  const pick = (code: string) => {
    setOpen(false);
    setQ('');
    if (code !== current || !pathname.startsWith('/facilities/')) {
      router.push(swapFacilityInPath(pathname, tab, code));
      closeNav();
    }
  };
  return (
    <div ref={ref} className={styles.facPick}>
      <button type="button" className={styles.facBtn} onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open}>
        <Buildings size={14} className={picker.accentIcon} />
        <span className={styles.facWho}>
          <span className={styles.facCode}>{cur ? cur.name : t('Choose a facility')}</span>
          {cur && <span className={styles.facTitle}>{cur.sub}</span>}
        </span>
        <CaretDown size={12} className={picker.mutedIcon} />
      </button>
      {open &&
        createPortal(
          <div ref={menuRef} className={cx('elev-md', picker.pickMenu, styles.facMenu)} style={pos}>
            <div className={picker.menuHead}>{t('Switch facility')}</div>
            {mineCount > 0 && mineCount < options.length && (
              <Segmented
                className={picker.pickSeg}
                fullWidth
                value={scope}
                onChange={(v) => {
                  setScope(v);
                  setQ('');
                }}
                options={[
                  { value: 'mine' as const, label: t('My facilities'), count: mineCount },
                  { value: 'all' as const, label: t('All I see'), count: options.length },
                ]}
              />
            )}
            <div className={picker.pickSearch}>
              <MagnifyingGlass size={13} className={picker.pickSearchIcon} />
              <input className={cx('input', picker.pickInput)} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search a code or a name…')} aria-label={t('Search a code or a name…')} autoFocus />
            </div>
            {shown.map((o) => (
              <button key={o.code} type="button" aria-current={o.code === current ? 'true' : undefined} className={cx(picker.pickOpt, o.code === current && picker.pickOptOn)} onClick={() => pick(o.code)}>
                <span className={picker.stack}>
                  <span className={picker.ellipsis}>{`${o.code} · ${o.name}`}</span>
                  <span className={picker.optSub}>{o.sub}</span>
                </span>
                <span className={picker.optRight}>{o.mine && <span className="tag tag-neutral">{t('I manage it')}</span>}</span>
              </button>
            ))}
            {!shown.length && <span className={picker.menuEmpty}>{t('No facility in this scope')}</span>}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** "View as" profile switcher of the demo mode. */
function ViewAs({ role, personas }: { role: RoleKey; personas: SidebarPersona[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useDismiss(open, setOpen);
  const viewer = personas.find((p) => p.role === role) ?? personas[0];
  if (!viewer) return null;
  return (
    <div ref={ref} className={styles.viewAs}>
      {open && (
        <div className={cx('elev-md', styles.menu)} role="menu">
          <div className={styles.menuHead}>{t('View as')}</div>
          {personas.map((p) => (
            <button
              key={p.role}
              type="button"
              role="menuitemradio"
              aria-checked={p.role === role}
              className={cx(styles.persona, p.role === role && styles.personaOn)}
              onClick={() => {
                setOpen(false);
                startTransition(async () => {
                  await setViewAs(p.role);
                });
              }}
            >
              <span className={styles.avatarSm}>{p.initials}</span>
              <span className={styles.who}>
                <span className={styles.whoName}>{p.name}</span>
                <span className={styles.whoRole}>{t(ROLE_LABEL[p.role])}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <button type="button" className="coque-user" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="coque-avatar">{viewer.initials}</span>
        <span className="coque-who">
          <span className="coque-who-name">{viewer.name}</span>
          <span className="coque-who-role">{t(ROLE_LABEL[viewer.role])}</span>
        </span>
        <CaretUpDown className="coque-user-caret" aria-hidden />
      </button>
    </div>
  );
}

/** Account menu of the signed-in user: active role among the roles held, sign out. */
function AccountMenu({ account }: { account: SidebarAccount }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useDismiss(open, setOpen);
  return (
    <div ref={ref} className={styles.viewAs}>
      {open && (
        <div className={cx('elev-md', styles.menu)} role="menu">
          {account.roles.length > 1 && <div className={styles.menuHead}>{t('Active role')}</div>}
          {account.roles.length > 1 &&
            account.roles.map((r) => (
              <button
                key={r}
                type="button"
                role="menuitemradio"
                aria-checked={r === account.role}
                className={cx(styles.persona, r === account.role && styles.personaOn)}
                onClick={() => {
                  setOpen(false);
                  startTransition(async () => {
                    await switchRole(r);
                  });
                }}
              >
                <span className={styles.who}>
                  <span className={styles.whoName}>{t(ROLE_LABEL[r])}</span>
                </span>
                {r === account.role && <Check size={14} className={styles.roleCheck} />}
              </button>
            ))}
          {account.roles.length > 1 && <div className={styles.menuSep} />}
          <form method="post" action={AUTH_PATHS.signOut} className={styles.signOutForm}>
            <button type="submit" className={styles.persona}>
              <SignOut size={14} />
              <span className={styles.whoName}>{t('Sign out')}</span>
            </button>
          </form>
        </div>
      )}
      <button type="button" className="coque-user" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="coque-avatar">{account.initials}</span>
        <span className="coque-who">
          <span className="coque-who-name">{account.name}</span>
          <span className="coque-who-role">{t(ROLE_LABEL[account.role])}</span>
        </span>
        <CaretUpDown className="coque-user-caret" aria-hidden />
      </button>
    </div>
  );
}
