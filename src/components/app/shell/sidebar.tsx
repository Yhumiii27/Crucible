'use client';
// Sidebar (derived from Keystone's shell, docs/spec/05): brand, entries by section, and at the bottom the "View as" switcher
// (demo mode) or the account menu of the signed-in user (Entra mode: active role, sign out), then the language toggle.
import { CaretDown, CaretUpDown, Check, Eye, Polygon, SignOut, Translate } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { cx } from '@/components/ds/cx';
import { ROLE_LABEL, type RoleKey } from '@/config/roles';
import { SCREEN_ICONS } from '@/config/screen-icons';
import { AUTH_PATHS } from '@/domain/auth';
import { useI18n } from '@/i18n/client';
import { setLang, setViewAs, switchRole } from '@/server/actions/preferences';
import { buildNav, type NavEntry } from './nav-model';
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

export interface SidebarProps {
  role: RoleKey;
  /** Demo mode: one persona per profile. */
  personas: SidebarPersona[];
  /** Entra mode: the signed-in user. */
  account: SidebarAccount | null;
  /** Counts shown next to an entry (the unread notifications of the bell). */
  badges?: Partial<Record<string, number>>;
}

/** Closes a popover on an outside click and on Escape. */
function useDismiss(open: boolean, setOpen: (v: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);
  return ref;
}

export function Sidebar({ role, personas, account, badges = {} }: SidebarProps) {
  const { t, lang } = useI18n();
  const pathname = usePathname();
  const nav = buildNav(role, pathname);
  const [, startTransition] = useTransition();

  const entry = (n: NavEntry, item: boolean) => {
    const Icon = SCREEN_ICONS[n.id] ?? Eye;
    return (
      <Link key={n.id} href={n.href} className={cx(styles.entry, item && styles.item, n.active && styles.active)} aria-current={n.active ? 'page' : undefined}>
        <Icon size={16} className={styles.icon} />
        <span className={styles.label}>{t(n.label)}</span>
        {!!badges[n.id] && <span className={styles.badge} aria-label={`${badges[n.id]} ${t('unread')}`}>{badges[n.id]}</span>}
      </Link>
    );
  };

  return (
    <aside className={styles.aside} aria-label={t('Main menu')}>
      <div className={styles.brand}>
        <div className={styles.logo}>
          <Polygon size={15} />
        </div>
        <div className={styles.wordmark}>Crucible</div>
      </div>
      <div className={styles.list}>{nav.fixed.map((n) => entry(n, false))}</div>
      <div className={styles.sections}>
        {nav.sections.map((sec) => (
          <div key={sec.key} className={styles.section}>
            <div className={cx(styles.secHead, styles.bright)}>
              <CaretDown size={11} className={styles.icon} />
              <span className={styles.label}>{t(sec.label)}</span>
            </div>
            {sec.sub && <div className={styles.sub}>{sec.sub}</div>}
            {sec.entries.map((n) => entry(n, true))}
          </div>
        ))}
      </div>
      <button
        type="button"
        className={cx(styles.entry)}
        onClick={() => startTransition(() => setLang(lang === 'fr' ? 'en' : 'fr'))}
        aria-label={t('Switch language')}
      >
        <Translate size={16} className={styles.icon} />
        <span className={styles.label}>{lang === 'fr' ? 'English' : 'Français'}</span>
      </button>
      {account ? <AccountMenu account={account} /> : <ViewAs role={role} personas={personas} />}
    </aside>
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
      <button type="button" className={styles.trigger} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <div className={styles.avatar}>{viewer.initials}</div>
        <div className={styles.who}>
          <span className={styles.triggerName}>{viewer.name}</span>
          <span className={styles.whoRole}>{t(ROLE_LABEL[viewer.role])}</span>
        </div>
        <CaretUpDown className={styles.caret} />
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
      <button type="button" className={styles.trigger} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <div className={styles.avatar}>{account.initials}</div>
        <div className={styles.who}>
          <span className={styles.triggerName}>{account.name}</span>
          <span className={styles.whoRole}>{t(ROLE_LABEL[account.role])}</span>
        </div>
        <CaretUpDown className={styles.caret} />
      </button>
    </div>
  );
}
