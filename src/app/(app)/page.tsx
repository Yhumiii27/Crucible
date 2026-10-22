// Home (docs/spec/05): who I am in Crucible — profile, scope — and the facilities and projects I see. Later deliveries add my
// next bookings, my pending requests, the conflicts to arbitrate and the alerts.
import { KpiGrid, KpiTile } from '@/components/app/Kpi';
import { PageHeader } from '@/components/app/shell/page-header';
import { ROLE_LABEL } from '@/config/roles';
import { visibleFacilities, visibleProjects } from '@/server/dal/visibility';
import { getI18n, getViewer } from '@/server/session';

export default async function HomePage() {
  const [{ t }, viewer] = await Promise.all([getI18n(), getViewer()]);
  const [facilities, projects] = await Promise.all([visibleFacilities(viewer), visibleProjects(viewer)]);
  const scopes = viewer.assignments.filter((a) => a.role === viewer.role).map((a) => a.scopeRef ?? t('Whole group'));
  return (
    <>
      <PageHeader screen="home" title={`${t('Hello')} ${viewer.name.split(' ')[0]}`} />
      <KpiGrid min={170}>
        <KpiTile label={t('Active profile')} value={t(ROLE_LABEL[viewer.role])} sub={scopes.join(' · ')} size="lg" />
        {viewer.role !== 'admin' && <KpiTile label={t('Visible facilities')} value={facilities.length} sub={facilities.map((f) => f.code).join(' · ') || '—'} size="lg" />}
        {viewer.role !== 'admin' && viewer.role !== 'technician' && <KpiTile label={t('Visible projects')} value={projects.length} size="lg" />}
      </KpiGrid>
    </>
  );
}
