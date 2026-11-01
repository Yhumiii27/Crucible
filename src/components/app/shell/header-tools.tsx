'use client';
// Tools of the page header (Keystone's header islands, docs/spec/01 §5 there; delivery 5b): global search, the bell and its
// latest notifications, the assistant's button (delivery 6), the status date, the language toggle, Export (CSV of the screen's current view, when it has one).
// Strings arrive translated from the server, typed text as typed.
import { Bell, CalendarBlank, Export, FileCode, FileCsv, MagnifyingGlass } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { cx } from '@/components/ds/cx';
import { MenuEmpty, MenuHeader, MenuItem } from '@/components/ds/Menu';
import { Popover } from '@/components/ds/Popover';
import { Segmented } from '@/components/ds/Segmented';
import { AssistantButton } from '@/features/assistant/panel';
import { markNotificationsReadAction } from '@/features/incidents/actions';
import { useI18n } from '@/i18n/client';
import type { Lang } from '@/i18n/translate';
import { setLang } from '@/server/actions/preferences';
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

function GlobalSearch() {
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
    <div className={styles.search}>
      <MagnifyingGlass size={13} className={styles.searchIcon} />
      <input
        className={cx('input', styles.searchInput)}
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
    </div>
  );
}

function Notifications({ items, unread }: { items: BellItem[]; unread: number }) {
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
        className={cx('btn btn-icon btn-secondary', styles.bell)}
        onClick={() => setOpen((o) => !o)}
        title={t('Notifications')}
        aria-label={unread ? `${t('Notifications')} · ${unread} ${t('unread')}` : t('Notifications')}
        aria-expanded={open}
      >
        <Bell size={15} />
        {unread > 0 && <span className={styles.bellBadge}>{unread}</span>}
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
                  <Bell size={14} />
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

function LangToggle({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <Segmented
      label="Language"
      value={lang}
      onChange={(v) =>
        start(async () => {
          await setLang(v);
          router.refresh();
        })
      }
      options={[
        { value: 'fr' as Lang, label: 'FR' },
        { value: 'en' as Lang, label: 'EN' },
      ]}
    />
  );
}

function ExportButton({ screen }: { screen: string | null }) {
  const { t } = useI18n();
  const run = (json = false) => {
    if (!screen) return;
    // A download (Content-Disposition: attachment): the page stays. JSON (CR-077) for a BI tool.
    const q = new URLSearchParams(window.location.search);
    if (json) q.set('format', 'json');
    const a = document.createElement('a');
    a.href = `/api/export/${encodeURIComponent(screen)}${q.size ? `?${q}` : ''}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  return (
    <Popover
      triggerClassName="btn btn-secondary"
      trigger={
        <>
          <Export size={15} />
          {t('Export')}
        </>
      }
      align="end"
      minWidth="200px"
      zIndex={30}
    >
      <MenuHeader>{t('Export this view')}</MenuHeader>
      {screen ? (
        <>
          <MenuItem icon={FileCsv} onClick={() => run()}>
            {t('CSV (Excel)')}
          </MenuItem>
          <MenuItem icon={FileCode} onClick={() => run(true)}>
            {t('JSON (BI tools)')}
          </MenuItem>
        </>
      ) : (
        <MenuEmpty>{t('Nothing to export on this screen')}</MenuEmpty>
      )}
    </Popover>
  );
}

export function HeaderTools({ items, unread, statusDate, lang, exportScreen, bell, assistant }: {
  items: BellItem[]; unread: number; statusDate: string; lang: Lang; exportScreen: string | null; bell: boolean; assistant: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className={styles.actions} data-print-hide>
      <GlobalSearch />
      {assistant && <AssistantButton />}
      {bell && <Notifications items={items} unread={unread} />}
      <span className={styles.statusDate}>
        <CalendarBlank size={13} />
        {t('Status date')} · {statusDate}
      </span>
      <LangToggle lang={lang} />
      <ExportButton screen={exportScreen} />
    </div>
  );
}
