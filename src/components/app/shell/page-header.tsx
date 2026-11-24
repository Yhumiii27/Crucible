// Page header (Norma 2.0, charte/COQUE.md § 3): the charte's PageHeader with Crucible's slots. Fixed order, left to right:
// breadcrumb and title (+ tags) · global search · the page's actions (secondary ones, the export, then the main action, the
// rightmost; beyond three buttons the « Actions » menu) · status date, assistant, bell · the language / display pair, last.
// Under it the "outside my workspace" banner (read-only: the actions disappear) and the page's toolbar (tabs, filters, period).
import { Eye } from '@phosphor-icons/react/dist/ssr';
import { FilterBar } from '@norma/charte/ds/FilterBar';
import { StatusDate } from '@norma/charte/ds/HeaderTools';
import { PageHeader as CoqueHeader } from '@norma/charte/ds/PageHeader';
import type { ReactNode } from 'react';
import { SCREEN_BY_ID, canSee, type ScreenId } from '@/config/screens';
import { fmtDate, fmtInstant } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { myNotifications } from '@/server/dal/incidents';
import { isExportable } from '@/server/export/views';
import { getI18n, getTheme, getViewer } from '@/server/session';
import { AssistantHelp, ExportAction, GlobalSearch, Notifications, type BellItem } from './header-islands';
import { splitPageActions } from './page-actions';
import { Prefs } from './prefs';

export interface PageHeaderProps {
  screen: ScreenId;
  /** Title override, already translated or typed (a facility or project name). */
  title?: string;
  /** Breadcrumb, EN source strings (translated); the tool's name is in the sidebar, not here. */
  crumbs?: string[];
  /** Typed breadcrumb item shown as is (a facility or project code), or a switcher. */
  crumbData?: ReactNode;
  /** Next to the title: tags, the facility's state… */
  aside?: ReactNode;
  /**
   * The page's actions, client elements only so that they can be counted (a fragment of several is fine): the last one with
   * `variant="primary"` (else the last one) is the main action, the rightmost; the others are secondary actions on its left.
   */
  primary?: ReactNode;
  /** More secondary actions, before those of `primary`. */
  actions?: ReactNode;
  /** Under the header: tabs, filters, period navigation (in the charte's FilterBar). */
  toolbar?: ReactNode;
}

export async function PageHeader({ screen, title, crumbs = [], crumbData, aside, primary, actions, toolbar }: PageHeaderProps) {
  const [{ t, lang }, viewer, today, theme] = await Promise.all([getI18n(), getViewer(), businessToday(), getTheme()]);
  const def = SCREEN_BY_ID[screen];
  const outside = !canSee(viewer.role, screen);
  const bell = viewer.role !== 'admin';
  const notes = bell ? await myNotifications(viewer.userId) : { rows: [], unread: 0 };
  const items: BellItem[] = notes.rows.slice(0, 8).map((n) => ({
    id: n.id, href: n.href, read: !!n.readAt, when: fmtInstant(n.createdAt, lang),
    title: n.title.split(' · ').map((x, i) => (i === 0 ? t(x) : x)).join(' · '),
  }));
  const exportable = isExportable(screen) && !outside;
  const { main, others } = splitPageActions(primary);
  const readOnly = outside ? (
    <span className="tag tag-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <Eye size={12} aria-hidden /> {t('Read-only')}
    </span>
  ) : null;
  return (
    <CoqueHeader
      crumbs={[...crumbs.map((c) => t(c)), ...(crumbData != null ? [crumbData] : [])]}
      title={title ?? t(def.title)}
      titleAside={readOnly || aside ? <>{readOnly}{aside}</> : undefined}
      search={<GlobalSearch />}
      primary={main ?? undefined}
      actions={
        <>
          {actions}
          {others}
          {exportable && <ExportAction screen={screen} />}
        </>
      }
      date={<StatusDate>{`${t('Status date')} · ${fmtDate(today, lang)}`}</StatusDate>}
      help={bell ? <AssistantHelp /> : undefined}
      bell={bell ? <Notifications items={items} unread={notes.unread} /> : undefined}
      prefs={<Prefs lang={lang} theme={theme} />}
      outside={outside ? t('Outside my workspace · Read-only') : undefined}
      toolbar={toolbar ? <FilterBar>{toolbar}</FilterBar> : undefined}
    />
  );
}
