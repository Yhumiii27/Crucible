// Page header (derived from Keystone's PageHeader; delivery 5b): breadcrumb and title on the left, the header tools on the
// right (global search, the assistant (delivery 6), bell, status date, language, Export), then the page's actions under it — a button opening a side panel
// for each form. The "outside my workspace" banner shows when the screen is not in the profile's workspace (read-only: the
// page hides its actions).
import { Eye } from '@phosphor-icons/react/dist/ssr';
import type { ReactNode } from 'react';
import { SCREEN_BY_ID, canSee, type ScreenId } from '@/config/screens';
import { fmtDate, fmtInstant } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { myNotifications } from '@/server/dal/incidents';
import { isExportable } from '@/server/export/views';
import { getI18n, getViewer } from '@/server/session';
import { HeaderTools, type BellItem } from './header-tools';
import styles from './header.module.css';

export interface PageHeaderProps {
  screen: ScreenId;
  /** Title override, already translated or typed (a facility or project name). */
  title?: string;
  /** Breadcrumb, EN source strings (translated) — "Crucible" comes first. */
  crumbs?: string[];
  /** Typed breadcrumb item shown as is (a facility or project code), or a switcher. */
  crumbData?: ReactNode;
  /** Next to the title: tags, the facility's state… */
  aside?: ReactNode;
  /** The page's actions (buttons opening side panels), under the header. */
  primary?: ReactNode;
  /** Left of the actions row: filters, period navigation. */
  toolbar?: ReactNode;
}

export async function PageHeader({ screen, title, crumbs = [], crumbData, aside, primary, toolbar }: PageHeaderProps) {
  const [{ t, lang }, viewer, today] = await Promise.all([getI18n(), getViewer(), businessToday()]);
  const def = SCREEN_BY_ID[screen];
  const outside = !canSee(viewer.role, screen);
  const bell = viewer.role !== 'admin';
  const notes = bell ? await myNotifications(viewer.userId) : { rows: [], unread: 0 };
  const items: BellItem[] = notes.rows.slice(0, 8).map((n) => ({
    id: n.id, href: n.href, read: !!n.readAt, when: fmtInstant(n.createdAt, lang),
    title: n.title.split(' · ').map((x, i) => (i === 0 ? t(x) : x)).join(' · '),
  }));
  return (
    <>
      <header className={styles.header}>
        <div className={styles.left}>
          <div className={styles.crumb}>
            <span>Crucible</span>
            {crumbs.map((c) => (
              <span key={c} style={{ display: 'contents' }}>
                <span className={styles.sep}>/</span>
                <span>{t(c)}</span>
              </span>
            ))}
            {crumbData && (
              <>
                <span className={styles.sep}>/</span>
                {typeof crumbData === 'string' ? <span>{crumbData}</span> : crumbData}
              </>
            )}
          </div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title ?? t(def.title)}</h1>
            {outside && (
              <span className={`tag tag-outline ${styles.roTag}`}>
                <Eye size={12} /> {t('Read-only')}
              </span>
            )}
            {aside}
          </div>
        </div>
        <HeaderTools items={items} unread={notes.unread} statusDate={fmtDate(today, lang)} lang={lang} bell={bell} assistant={bell} exportScreen={isExportable(screen) && !outside ? screen : null} />
      </header>
      {(toolbar || (primary && !outside)) && (
        <div className={styles.pageBar}>
          <div className={styles.toolbar}>{toolbar}</div>
          {!outside && primary && <div className={styles.actions}>{primary}</div>}
        </div>
      )}
      {outside && (
        <div className="tag tag-outline" role="note" style={{ alignSelf: 'flex-start' }}>
          {t('Outside my workspace · Read-only')}
        </div>
      )}
    </>
  );
}
