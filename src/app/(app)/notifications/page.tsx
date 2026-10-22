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
import { MarkReadButton } from '@/features/incidents/forms';
import { fmtInstant } from '@/lib/format';
import { myNotifications } from '@/server/dal/incidents';
import { getI18n, getViewer } from '@/server/session';

export default async function NotificationsPage() {
  const [{ t, lang }, viewer] = await Promise.all([getI18n(), getViewer()]);
  if (!canSee(viewer.role, 'notifications')) notFound();
  const { rows, unread } = await myNotifications(viewer.userId);
  const title = (s: string) => s.split(' · ').map((x, i) => (i === 0 ? t(x) : x)).join(' · ');
  return (
    <>
      <PageHeader screen="notifications" />
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
    </>
  );
}
