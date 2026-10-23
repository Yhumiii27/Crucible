// Home (docs/spec/05; delivery 5b after Keystone's home): greeting, the figures of the viewer's work, then — for those who
// decide — what waits for their decision, for those who plan the facilities the load of the next 8 weeks, for those who see
// the bookings the tests of the next 7 days, for those who enter needs their open needs.
import Link from 'next/link';
import { KpiGrid, KpiTile } from '@/components/app/Kpi';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Table, Td, Th } from '@/components/ds/Table';
import { ROLE_LABEL } from '@/config/roles';
import { canSee } from '@/config/screens';
import { BOOKING_STATUS_LABEL } from '@/domain/resources';
import { DecisionList } from '@/features/decisions/decision-list';
import { LoadHeat } from '@/features/load/heat';
import { heatGroups } from '@/features/load/heat-data';
import { dataText } from '@/i18n/data-text';
import { fmtDate, fmtSlot } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { decisionQueue } from '@/server/dal/decisions';
import { DETAIL_WEEKS, loadScreen, myNeeds } from '@/server/dal/needs';
import { upcomingBookings } from '@/server/dal/resources';
import { visibleFacilities, visibleProjects } from '@/server/dal/visibility';
import { getI18n, getViewer } from '@/server/session';
import s from './home.module.css';

const WEEKS = 8;

export default async function HomePage() {
  const [{ t, lang }, viewer, today] = await Promise.all([getI18n(), getViewer(), businessToday()]);
  const admin = viewer.role === 'admin';
  const [facilities, projects, load, needs, queue, week] = await Promise.all([
    visibleFacilities(viewer),
    visibleProjects(viewer),
    canSee(viewer.role, 'load') ? loadScreen(viewer, today) : null,
    canSee(viewer.role, 'my-needs') ? myNeeds(viewer, today) : null,
    canSee(viewer.role, 'decide') ? decisionQueue(viewer) : null,
    admin ? [] : upcomingBookings(viewer, today, 7),
  ]);
  const scopes = viewer.assignments.filter((a) => a.role === viewer.role).map((a) => a.scopeRef ?? t('Whole group'));
  const bottlenecks = load?.signals.filter((x) => x.kind === 'bottleneck' && x.weeksAhead < DETAIL_WEEKS) ?? [];
  const needsAhead = load?.needs.filter((n) => n.spread && n.spread.remainingHours > 0) ?? [];
  const nf = (n: number) => n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB');
  const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  const weekLabels = load ? load.weeks.slice(0, WEEKS).map((m) => fmtDate(m, lang).slice(0, 5)) : [];
  return (
    <>
      <PageHeader screen="home" />
      <div className={s.hello}>
        <div className={s.helloName}>{`${t('Hello')}, ${viewer.name.split(' ')[0]}`}</div>
        <div className={s.helloSub}>{[t(ROLE_LABEL[viewer.role]), scopes.join(' · '), weekday].filter(Boolean).join(' · ')}</div>
      </div>
      <KpiGrid min={170}>
        {queue && (
          <KpiTile label={t('To decide')} value={queue.items.length} size="lg"
            sub={`${queue.openConflicts} ${t('conflicts')} · ${queue.openProposals} ${t('proposals')}`} href="/my/decisions" />
        )}
        {load && (
          <KpiTile label={t('Bottlenecks in the next 26 weeks')} value={bottlenecks.length} size="lg" href="/load"
            sub={bottlenecks[0] ? `${bottlenecks[0].subject} · ${t('Week of')} ${fmtDate(bottlenecks[0].monday, lang)}` : t('None')} />
        )}
        {load && <KpiTile label={t('Open needs not booked yet')} value={needsAhead.length} size="lg" sub={`${nf(needsAhead.reduce((a, n) => a + (n.spread?.remainingHalfDays ?? 0), 0) / 2)} ${t('days of tests')}`} />}
        {needs && <KpiTile label={t('My open needs')} value={needs.needs.length} sub={`${needs.needs.filter((n) => n.late).length} ${t('late requests')}`} size="lg" href="/my/needs" />}
        {!admin && <KpiTile label={t('Tests of the next 7 days')} value={week.length} size="lg" sub={`${week.filter((b) => b.status === 'requested').length} ${t('requested, to confirm')}`} />}
        {!admin && <KpiTile label={t('Visible facilities')} value={facilities.length} sub={facilities.map((f) => f.code).join(' · ') || '—'} size="lg" />}
        {!admin && viewer.role !== 'technician' && !load && <KpiTile label={t('Visible projects')} value={projects.length} size="lg" />}
        {admin && <KpiTile label={t('Active profile')} value={t(ROLE_LABEL[viewer.role])} size="lg" />}
      </KpiGrid>

      {(queue || load) && (
        <div className={s.row}>
          {queue && (
            <SectionCard title={t('To decide')} hint={String(queue.items.length)} flex="999 1 520px">
              <DecisionList items={queue.items.slice(0, 5)} t={t} lang={lang} safety={viewer.role === 'safety'} />
              {queue.items.length > 5 && <Link href="/my/decisions">{t('All the decisions waiting')}</Link>}
            </SectionCard>
          )}
          {load && (
            <SectionCard title={t('Load of the resources — next 8 weeks')} subtitle={t('% of the net capacity · one tile per week')} flex="1 1 380px"
              actions={<Link href="/load">{t('Load forecast')}</Link>}>
              <LoadHeat compact weeks={weekLabels} groups={heatGroups(load, 0, WEEKS, t, lang)} t={t} />
            </SectionCard>
          )}
        </div>
      )}

      {!admin && (
        <SectionCard title={t('Tests of the next 7 days')} hint={String(week.length)} scroll actions={canSee(viewer.role, 'planning') ? <Link href="/planning">{t('Open the resource planning')}</Link> : undefined}>
          {week.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>{t('When')}</Th>
                  <Th>{t('Resource')}</Th>
                  <Th>{t('Project')}</Th>
                  <Th>{t('Purpose')}</Th>
                  <Th>{t('Status')}</Th>
                </tr>
              </thead>
              <tbody>
                {week.map((b) => (
                  <tr key={b.id}>
                    <Td nowrap>{fmtSlot(b.start, b.end, lang)}</Td>
                    <Td nowrap>{b.resourceCode}</Td>
                    <Td>{b.projectCode ?? t('Project not visible')}</Td>
                    <Td>{b.title ? dataText(b.title, lang) : `${t('Booked')} · ${b.entityCode}`}</Td>
                    <Td><span className={b.status === 'requested' ? 'tag tag-outline' : b.status === 'in_progress' ? 'tag tag-accent' : 'tag tag-neutral'}>{t(BOOKING_STATUS_LABEL[b.status])}</span></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <span className="text-muted">{t('No test in the next 7 days.')}</span>
          )}
        </SectionCard>
      )}
      {needs && <p><Link href="/my/needs">{t('Open my test needs')}</Link></p>}
    </>
  );
}
