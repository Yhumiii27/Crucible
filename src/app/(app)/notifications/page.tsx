// Notifications (decision F-8; delivery 5): the bell — bookings confirmed, cancelled or moved, incidents on my tests, scenarios
// and conflicts to decide, overdue arbitrations, the weekly recap. Each one opens the screen concerned. The same notifications
// are e-mailed by the worker when a transport is set.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Tag } from '@/components/ds/Tag';
import { canSee } from '@/config/screens';
import { Folded } from '@/components/app/ActionForm';
import { MarkReadButton } from '@/features/incidents/forms';
import { CalendarFeedForm, RevokeFeedButton } from '@/features/measure/forms';
import { fmtInstant } from '@/lib/format';
import { myCalendarFeeds } from '@/server/calendar';
import { myNotifications } from '@/server/dal/incidents';
import { visibleResources } from '@/server/dal/visibility';
import { getI18n, getViewer } from '@/server/session';

export default async function NotificationsPage() {
  const [{ t, lang }, viewer] = await Promise.all([getI18n(), getViewer()]);
  if (!canSee(viewer.role, 'notifications')) notFound();
  const [{ rows, unread }, feeds, resources] = await Promise.all([myNotifications(viewer.userId), myCalendarFeeds(viewer.userId), visibleResources(viewer)]);
  const title = (s: string) => s.split(' · ').map((x, i) => (i === 0 ? t(x) : x)).join(' · ');
  return (
    <>
      <PageHeader screen="notifications"
        primary={
          <Folded summary="Subscribe from Outlook" size="md">
            <p className="text-muted">{t('Your tests, or a resource, in your Outlook calendar (and so in Teams), updated every hour with your rights.')}</p>
            <CalendarFeedForm resources={resources.map((r) => ({ value: r.id, label: r.code }))} />
          </Folded>
        }
      />
      <SectionCard title={t('Notifications')} hint={String(unread)} actions={unread > 0 ? <MarkReadButton /> : undefined}>
        {rows.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {rows.map((n) => (
              <div key={n.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                {!n.readAt && <Tag tone="accent" size="xs">{t('New')}</Tag>}
                {n.href ? <Link href={n.href}>{title(n.title)}</Link> : <span>{title(n.title)}</span>}
                <span className="text-muted" style={{ fontSize: 12 }}>{fmtInstant(n.createdAt, lang)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>{t('No notification.')}</EmptyState>
        )}
      </SectionCard>
      <SectionCard title={t('Outlook and Teams calendars')} hint={String(feeds.length)}
        subtitle={t('Confirmed, moved and cancelled bookings also come as invitations attached to the e-mails, when the e-mail is set up.')}>
        {feeds.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {feeds.map((f) => (
              <div key={f.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span>{f.scope === 'resource' ? `${t('Resource')} ${f.resourceCode ?? ''}` : t('My tests')}</span>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  {t('created')} {fmtInstant(f.createdAt, lang)}{f.lastReadAt ? ` · ${t('last read')} ${fmtInstant(f.lastReadAt, lang)}` : ` · ${t('never read')}`}
                </span>
                <RevokeFeedButton id={f.id} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>{t('No calendar subscription.')}</EmptyState>
        )}
      </SectionCard>
    </>
  );
}
