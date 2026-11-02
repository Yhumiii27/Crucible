'use client';
// Phone and tablet layout (CR-082, X-21; R-146 of Keystone): up to 1024 px the sidebar is a drawer (sidebar.module.css) and a
// sticky top bar carries the menu button (shell.module.css). The drawer closes on its close button, the backdrop, Escape and
// any link followed in it.
import { List, Polygon } from '@phosphor-icons/react/dist/ssr';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { cx } from '@/components/ds/cx';
import { useI18n } from '@/i18n/client';
import styles from './shell.module.css';

interface MenuState {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const Ctx = createContext<MenuState>({ open: false, setOpen: () => {} });

export function MobileMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useMobileMenu = () => useContext(Ctx);

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
