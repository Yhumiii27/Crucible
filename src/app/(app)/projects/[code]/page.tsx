// Project sheet (docs/spec/02 §3, 03 §6; delivery 3): the milestones of a project, its test needs — forecasts and requests,
// how much of each is booked, the late requests (F-5) — and its bookings with the Codex reference of their reports (P-4,
// S-6). A project outside the viewer's visibility does not exist (404). Those who enter the project's needs (canManageNeeds)
// edit them here.
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Tag } from '@/components/ds/Tag';
import { Table, Td, Th } from '@/components/ds/Table';
import { canSee } from '@/config/screens';
import { MILESTONE_CRITICALITY_LABEL } from '@/domain/needs';
import { PRIORITY_CLASS_LABEL } from '@/domain/organisation';
import { BOOKING_STATUS_LABEL } from '@/domain/resources';
import { operatedFacilities } from '@/domain/rights';
import { EditMilestone, MilestoneForm, NeedForm, ReportRefForm } from '@/features/needs/forms';
import { NeedsTable } from '@/features/needs/needs-table';
import { dataText } from '@/i18n/data-text';
import { fmtDate, fmtSlot } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { projectSheet } from '@/server/dal/needs';
import { getI18n, getViewer } from '@/server/session';

export default async function ProjectPage({ params }: PageProps<'/projects/[code]'>) {
  const { code } = await params;
  const [{ t, lang }, viewer, today] = await Promise.all([getI18n(), getViewer(), businessToday()]);
  if (!canSee(viewer.role, 'project')) notFound();
  const sheet = await projectSheet(viewer, decodeURIComponent(code), today);
  if (!sheet) notFound();
  const { project, manage } = sheet;
  const runs = operatedFacilities(viewer.role, viewer.assignments);
  const milestones = sheet.milestones.map((m) => ({ id: m.id, projectCode: m.projectCode, label: dataText(m.label, lang), dueOn: m.dueOn, criticality: m.criticality }));
  const resources = sheet.choices.resources.map((r) => ({ id: r.id, code: r.code, name: dataText(r.name, lang) }));
  const testTypes = sheet.choices.testTypes.map((x) => ({ ...x, name: dataText(x.name, lang) }));
  const links = [project.keystoneCode && `Keystone ${project.keystoneCode}`, project.codexProgramCode && `Codex ${project.codexProgramCode}`].filter(Boolean).join(' · ');
  return (
    <>
      <PageHeader screen="project" title={dataText(project.name, lang)} crumbs={['Projects']} crumbData={project.code} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
        <span>{dataText(project.entityName, lang)}</span>
        <Tag size="sm">{t(PRIORITY_CLASS_LABEL[project.priorityClass])}</Tag>
        {project.confidential && <Tag tone="outline" size="sm">{t('Confidential')}</Tag>}
        {links && <span className="text-muted">{links}</span>}
      </div>

      <SectionCard title={t('Milestones')} hint={String(milestones.length)} subtitle={t('The dates the tests serve: a need without a deadline is due on its milestone.')}>
        {milestones.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Milestone')}</Th>
                <Th>{t('Date')}</Th>
                <Th>{t('Criticality')}</Th>
                <Th>{t('Source')}</Th>
                {manage && <Th />}
              </tr>
            </thead>
            <tbody>
              {sheet.milestones.map((m, i) => (
                <tr key={m.id}>
                  <Td>{milestones[i].label}</Td>
                  <Td nowrap>{fmtDate(m.dueOn, lang)}</Td>
                  <Td>{t(MILESTONE_CRITICALITY_LABEL[m.criticality])}</Td>
                  <Td tone="secondary">{m.source === 'keystone' ? 'Keystone' : 'Crucible'}</Td>
                  {manage && <Td>{m.source === 'crucible' && <EditMilestone milestone={milestones[i]} />}</Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No milestone yet.')}</EmptyState>
        )}
        {manage && <MilestoneForm projectCode={project.code} />}
      </SectionCard>

      <SectionCard title={t('Test needs')} hint={String(sheet.needs.filter((n) => n.status === 'open').length)} subtitle={t('Forecasts and requests; the part not booked yet is the load the forecast counts.')} scroll>
        <NeedsTable needs={sheet.needs} manage={manage} edit={{ projects: [{ code: project.code, name: dataText(project.name, lang) }], milestones, resources, testTypes, today }} />
      </SectionCard>
      {manage && (
        <SectionCard title={t('Record a need')} subtitle={t('A request is made at least 10 working days before the test (F-5); a late request is accepted when there is room, and counted.')}>
          <NeedForm projects={[{ code: project.code, name: dataText(project.name, lang) }]} milestones={milestones} resources={resources} testTypes={testTypes} today={today} />
        </SectionCard>
      )}

      <SectionCard title={t('Bookings')} hint={String(sheet.bookings.length)} scroll>
        {sheet.bookings.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Booking')}</Th>
                <Th>{t('Resource')}</Th>
                <Th>{t('Slot')}</Th>
                <Th>{t('Test')}</Th>
                <Th>{t('Status')}</Th>
                <Th>{t('Test report')}</Th>
              </tr>
            </thead>
            <tbody>
              {sheet.bookings.map((b) => (
                <tr key={b.id}>
                  <Td valign="top">{b.ref}</Td>
                  <Td valign="top">{b.resourceCode}</Td>
                  <Td valign="top" nowrap>{fmtSlot(b.start, b.end, lang)}</Td>
                  <Td valign="top">
                    {dataText(b.title, lang)}
                    {b.needRef && <div className="text-muted">{t('Need')} {b.needRef}</div>}
                  </Td>
                  <Td valign="top"><Tag size="sm" tone={b.status === 'confirmed' || b.status === 'in_progress' ? 'accent' : b.status === 'requested' ? 'outline' : 'neutral'}>{t(BOOKING_STATUS_LABEL[b.status])}</Tag></Td>
                  <Td valign="top">
                    {b.status === 'done' && (manage || runs.includes(b.facilityCode)) ? <ReportRefForm bookingId={b.id} codexRef={b.codexRef} /> : (b.codexRef ?? '—')}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No booking yet.')}</EmptyState>
        )}
      </SectionCard>
    </>
  );
}
