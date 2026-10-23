// My test needs (docs/spec/05 "Mes besoins", delivery 3): the projects whose needs I enter — my projects as a project lead,
// my entity's as a partner contact —, their milestones and open needs, with how much is booked and the late requests (F-5),
// the slots the engine proposes for them (delivery 4), and the form to record a need. Booking a slot for a need is done from
// the resource planning ("Need served").
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Folded } from '@/components/app/ActionForm';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Table, Td, Th } from '@/components/ds/Table';
import { canSee } from '@/config/screens';
import { MILESTONE_CRITICALITY_LABEL } from '@/domain/needs';
import { NeedForm } from '@/features/needs/forms';
import { NeedsTable } from '@/features/needs/needs-table';
import { dataText } from '@/i18n/data-text';
import { fmtDate, fmtSlot } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { myNeeds } from '@/server/dal/needs';
import { proposalsForProjects } from '@/server/dal/planning';
import { getI18n, getViewer } from '@/server/session';

export default async function MyNeedsPage() {
  const [{ t, lang }, viewer, today] = await Promise.all([getI18n(), getViewer(), businessToday()]);
  if (!canSee(viewer.role, 'my-needs')) notFound();
  const data = await myNeeds(viewer, today);
  const proposed = await proposalsForProjects(data.projects.map((p) => p.code));
  const projects = data.projects.map((p) => ({ code: p.code, name: dataText(p.name, lang) }));
  const milestones = data.milestones.map((m) => ({ id: m.id, projectCode: m.projectCode, label: dataText(m.label, lang), dueOn: m.dueOn, criticality: m.criticality }));
  const resources = data.choices.resources.map((r) => ({ id: r.id, code: r.code, name: dataText(r.name, lang) }));
  const testTypes = data.choices.testTypes.map((x) => ({ ...x, name: dataText(x.name, lang) }));
  return (
    <>
      <PageHeader screen="my-needs"
        primary={projects.length > 0 && resources.length > 0 ? (
          <Folded summary="Record a need" variant="primary" size="md">
            <p className="text-muted">{t('A request is made at least 10 working days before the test (F-5); a late request is accepted when there is room, and counted.')}</p>
            <NeedForm projects={projects} milestones={milestones} resources={resources} testTypes={testTypes} today={today} />
          </Folded>
        ) : undefined}
      />
      <SectionCard title={t('My projects')} hint={String(projects.length)}>
        {data.projects.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Project')}</Th>
                <Th>{t('Next milestone')}</Th>
                <Th align="right">{t('Open needs')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((p) => {
                const next = data.milestones.find((m) => m.projectCode === p.code && m.dueOn >= today);
                return (
                  <tr key={p.code}>
                    <Td><Link href={`/projects/${encodeURIComponent(p.code)}`}>{p.code}</Link> · {dataText(p.name, lang)}</Td>
                    <Td>{next ? `${dataText(next.label, lang)} · ${fmtDate(next.dueOn, lang)} · ${t(MILESTONE_CRITICALITY_LABEL[next.criticality])}` : '—'}</Td>
                    <Td align="right" numeric>{data.needs.filter((n) => n.projectCode === p.code).length}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No project whose needs you enter.')}</EmptyState>
        )}
      </SectionCard>
      <SectionCard title={t('Open needs')} hint={String(data.needs.length)} subtitle={t('Milestones are entered on the project sheet.')} scroll>
        <NeedsTable needs={data.needs} manage edit={{ projects, milestones, resources, testTypes, today }} showProject />
      </SectionCard>
      <SectionCard title={t('Slots proposed')} hint={String(proposed.length)} subtitle={t('Proposals of the engine for your needs; a manager of the facility confirms them.')}>
        {proposed.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Need')}</Th>
                <Th>{t('Resource')}</Th>
                <Th>{t('Slot')}</Th>
                <Th align="right">{t('Late (working days)')}</Th>
              </tr>
            </thead>
            <tbody>
              {proposed.map((x) => (
                <tr key={x.p.id}>
                  <Td>{x.needRef}</Td>
                  <Td>{x.resourceCode}{x.p.substitute ? ` (${t('validated substitute')})` : ''}</Td>
                  <Td nowrap>{fmtSlot(x.p.startsAt.getTime(), x.p.endsAt.getTime(), lang)}</Td>
                  <Td align="right" numeric>{x.p.lateDays}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No slot proposed yet.')}</EmptyState>
        )}
      </SectionCard>
    </>
  );
}
