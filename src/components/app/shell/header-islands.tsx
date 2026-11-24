'use client';
// Crucible's own islands of the page header (Norma 2.0, charte/COQUE.md § 3): the global search (search slot), the assistant
// (help slot, delivery 6), the bell and its latest notifications (bell slot) and the export of the screen's current view (a
// secondary action of the page; a menu row when the « Actions » menu takes the actions). The order, the status date and the
// language / display pair come from the charte's PageHeader and HeaderTools.
// Strings arrive translated from the server, typed text as typed.
import { Bell, Export, FileCode, FileCsv, MagnifyingGlass, Sparkle } from '@phosphor-icons/react/dist/ssr';
import { useHeaderMenu } from '@norma/charte/ds/HeaderActions';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { IconButton } from '@/components/ds/Button';
import { cx } from '@/components/ds/cx';
import { MenuHeader, MenuItem } from '@/components/ds/Menu';
import { Popover } from '@/components/ds/Popover';
import { openAssistant } from '@/features/assistant/panel';
import { markNotificationsReadAction } from '@/features/incidents/actions';
import { useI18n } from '@/i18n/client';
import { searchAction, type SearchHit } from '@/server/actions/search';
import styles from './header.module.css';

export interface BellItem {
  id: string;
  /** Translated title, typed parts as typed. */
  title: string;
  href: string | null;
  when: string;
  read: boolean;
}

/** Global search of resources, needs, bookings, projects (U-3), inside the charte's `.coque-header-search`. */
export function GlobalSearch() {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ query: string; hits: SearchHit[] } | null>(null);
  const query = q.trim();
  useEffect(() => {
    if (query.length < 2) return;
    let live = true;
    const h = setTimeout(async () => {
      const hits = await searchAction(query);
      if (live) setResult({ query, hits });
    }, 150);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [query]);
  const close = () => {
    setOpen(false);
    setQ('');
  };
  const visible = open && query.length >= 2;
  const fresh = result?.query === query;
  return (
    <>
      <MagnifyingGlass size={13} className="coque-header-search-icon" aria-hidden />
      <input
        className="input"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        placeholder={t('Search resources, needs, bookings, projects…')}
        aria-label={t('Search resources, needs, bookings, projects…')}
      />
      {visible && (
        <>
          <div className={styles.catcher} onClick={close} />
          <div className={cx('elev-md', styles.searchPanel)}>
            {fresh &&
              result.hits.map((r, i) => (
                <Link key={r.href + r.title + i} href={r.href} className={styles.hit} onClick={close}>
                  <span className={cx('tag tag-neutral', styles.hitKind)}>{t(r.kind)}</span>
                  <span className={styles.stack}>
                    <span className={styles.ellipsis}>{r.title}</span>
                    {r.sub && <span className={styles.hitSub}>{r.sub}</span>}
                  </span>
                </Link>
              ))}
            {fresh && !result.hits.length && <span className={styles.searchEmpty}>{t('No match — try a reference, a code or a name')}</span>}
          </div>
        </>
      )}
    </>
  );
}

/** The assistant's button (help slot): an icon button named « Assistant ». */
export function AssistantHelp() {
  const { t } = useI18n();
  return <IconButton icon={Sparkle} label={t('Assistant')} variant="secondary" size={32} onClick={() => openAssistant()} aria-haspopup="dialog" />;
}

/** The bell (bell slot) and its panel of the latest notifications. */
export function Notifications({ items, unread }: { items: BellItem[]; unread: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className={styles.rel}>
      <button
        type="button"
        className="btn btn-icon btn-secondary coque-bell"
        onClick={() => setOpen((o) => !o)}
        title={t('Notifications')}
        aria-label={unread ? `${t('Notifications')} · ${unread} ${t('unread')}` : t('Notifications')}
        aria-expanded={open}
      >
        <Bell size={15} aria-hidden />
        {unread > 0 && <span className="coque-bell-badge">{unread}</span>}
      </button>
      {open && (
        <div className={cx('elev-md', styles.notifPanel)}>
          <div className={styles.notifHead}>
            <span className={styles.notifTitle}>{t('Notifications')}</span>
            {unread > 0 && (
              <button
                type="button"
                className={cx('btn btn-ghost', styles.markAll)}
                onClick={() =>
                  start(async () => {
                    await markNotificationsReadAction();
                    router.refresh();
                  })
                }
              >
                {t('Mark all as read')}
              </button>
            )}
          </div>
          {items.map((n) => {
            const body = (
              <>
                <span className={cx(styles.dot, !n.read && styles.dotOn)} />
                <span className={styles.notifIcon}>
                  <Bell size={14} aria-hidden />
                </span>
                <span className={styles.stack}>
                  <span className={styles.notifText}>{n.title}</span>
                  <span className={styles.notifWhen}>{n.when}</span>
                </span>
              </>
            );
            return n.href ? (
              <Link key={n.id} href={n.href} className={cx(styles.notif, !n.read && styles.notifUnread)} onClick={() => setOpen(false)}>
                {body}
              </Link>
            ) : (
              <div key={n.id} className={cx(styles.notif, !n.read && styles.notifUnread)}>
                {body}
              </div>
            );
          })}
          {!items.length && <span className={styles.searchEmpty}>{t('No notification.')}</span>}
          <Link href="/notifications" className={styles.notifFoot} onClick={() => setOpen(false)}>
            {t('All notifications')}
          </Link>
        </div>
      )}
    </div>
  );
}

/** Export of the screen's current view (CSV, or JSON for a BI tool, CR-077): a secondary action of the page. */
export function ExportAction({ screen }: { screen: string }) {
  const { t } = useI18n();
  const menu = useHeaderMenu();
  const run = (json = false) => {
    // A download (Content-Disposition: attachment): the page stays.
    const q = new URLSearchParams(window.location.search);
    if (json) q.set('format', 'json');
    const a = document.createElement('a');
    a.href = `/api/export/${encodeURIComponent(screen)}${q.size ? `?${q}` : ''}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    menu?.close();
  };
  const rows = (
    <>
      <MenuHeader>{t('Export this view')}</MenuHeader>
      <MenuItem icon={FileCsv} onClick={() => run()}>
        {t('CSV (Excel)')}
      </MenuItem>
      <MenuItem icon={FileCode} onClick={() => run(true)}>
        {t('JSON (BI tools)')}
      </MenuItem>
    </>
  );
  if (menu) return rows;
  return (
    <Popover
      triggerClassName={cx('btn btn-secondary', styles.smBtn)}
      trigger={
        <>
          <Export size={15} aria-hidden />
          {t('Export')}
        </>
      }
      align="end"
      minWidth="200px"
      zIndex={30}
    >
      {rows}
    </Popover>
  );
}

