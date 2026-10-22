// Home (docs/spec/05): who I am in Crucible — profile, scope — and the facilities and projects I see; from delivery 3, the
// bottlenecks of the load forecast for those who plan the facilities, and my open test needs for those who enter them.
// Later deliveries add my next bookings, the conflicts to arbitrate and the other alerts.
import Link from 'next/link';
import { KpiGrid, KpiTile } from '@/components/app/Kpi';
import { PageHeader } from '@/components/app/shell/page-header';
import { ROLE_LABEL } from '@/config/roles';
import { canSee } from '@/config/screens';
import { fmtDate } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { DETAIL_WEEKS, loadScreen, myNeeds } from '@/server/dal/needs';
import { visibleFacilities, visibleProjects } from '@/server/dal/visibility';
import { getI18n, getViewer } from '@/server/session';

export default async function HomePage() {
  const [{ t, lang }, viewer, today] = await Promise.all([getI18n(), getViewer(), businessToday()]);
  const [facilities, projects, load, needs] = await Promise.all([
    visibleFacilities(viewer),
    visibleProjects(viewer),
    canSee(viewer.role, 'load') ? loadScreen(viewer, today) : null,
    canSee(viewer.role, 'my-needs') ? myNeeds(viewer, today) : null,
  ]);
  const scopes = viewer.assignments.filter((a) => a.role === viewer.role).map((a) => a.scopeRef ?? t('Whole group'));
  const bottlenecks = load?.signals.filter((x) => x.kind === 'bottleneck' && x.weeksAhead < DETAIL_WEEKS) ?? [];
  return (
    <>
      <PageHeader screen="home" title={`${t('Hello')} ${viewer.name.split(' ')[0]}`} />
      <KpiGrid min={170}>
        <KpiTile label={t('Active profile')} value={t(ROLE_LABEL[viewer.role])} sub={scopes.join(' · ')} size="lg" />
        {viewer.role !== 'admin' && <KpiTile label={t('Visible facilities')} value={facilities.length} sub={facilities.map((f) => f.code).join(' · ') || '—'} size="lg" />}
        {viewer.role !== 'admin' && viewer.role !== 'technician' && <KpiTile label={t('Visible projects')} value={projects.length} size="lg" />}
        {load && (
          <KpiTile label={t('Bottlenecks in the next 26 weeks')} value={bottlenecks.length} size="lg"
            sub={bottlenecks[0] ? `${bottlenecks[0].subject} · ${t('Week of')} ${fmtDate(bottlenecks[0].monday, lang)}` : t('None')} />
        )}
        {needs && <KpiTile label={t('My open needs')} value={needs.needs.length} sub={`${needs.needs.filter((n) => n.late).length} ${t('late requests')}`} size="lg" />}
      </KpiGrid>
      {load && bottlenecks.length > 0 && <p><Link href="/load">{t('Open the load forecast')}</Link></p>}
      {needs && <p><Link href="/my/needs">{t('Open my test needs')}</Link></p>}
    </>
  );
}
