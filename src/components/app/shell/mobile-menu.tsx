'use client';
// Phone and tablet layout (CR-082, X-21; R-146 of Keystone): up to 1024 px the sidebar is a drawer (sidebar.module.css) and a
// sticky top bar carries the menu button (shell.module.css). The drawer closes on its close button, the backdrop, Escape and
// any link followed in it.
import { List, Polygon } from '@phosphor-icons/react/dist/ssr';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { cx } from '@/components/ds/cx';
import { useI18n } from '@/i18n/client';
import styles from './shell.module.css';

interface MenuState {
  open: boolean;
  setOpen: (v: boolean) => void;
}

// The drawer's state lives in a small store read with useSyncExternalStore, not in a React context: the sidebar sits in its
// own Suspense boundary and may hydrate after the top bar. A context change made before that (a tap on "Menu" as soon as the
// top bar is interactive) could leave the hydrated sidebar on the server value, closed while the button said open (the phone
// journey failed about one time in five, on main too). A store is read again once the boundary hydrates.
let open = false;
const listeners = new Set<() => void>();
const setOpen = (v: boolean) => {
  if (v === open) return;
  open = v;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => open;
const serverSnapshot = () => false;

export function MobileMenuProvider({ children }: { children: ReactNode }) {
  const isOpen = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);
  return <>{children}</>;
}

export function useMobileMenu(): MenuState {
  return { open: useSyncExternalStore(subscribe, snapshot, serverSnapshot), setOpen };
}

/** The top bar of a phone or a tablet: the menu button and the name of the application. */
export function MobileTopbar() {
  const { t } = useI18n();
  const { open, setOpen } = useMobileMenu();
  return (
    <div className={styles.topbar} data-print-hide>
      <button type="button" className={cx('btn btn-secondary', styles.menuBtn)} onClick={() => setOpen(true)} aria-expanded={open} aria-controls="main-menu">
        <List size={18} />
        {t('Menu')}
      </button>
      <span className={styles.topbarBrand}>
        <Polygon size={15} className={styles.topbarLogo} />
        Crucible
      </span>
    </div>
  );
}
