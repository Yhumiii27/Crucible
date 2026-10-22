// Projects (docs/spec/05, S-1): the R&D projects the viewer sees in full — every non-confidential project for the people who
// plan the facilities, their own projects for a project lead, their entity's for a partner (U-3). Their test needs and
// milestones come with delivery 3.
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Table, Td, Th } from '@/components/ds/Table';
import { canSee } from '@/config/screens';
import { PRIORITY_CLASS_LABEL } from '@/domain/organisation';
import { dataText } from '@/i18n/data-text';
import { visibleProjects } from '@/server/dal/visibility';
import { getI18n, getViewer } from '@/server/session';

export default async function ProjectsPage() {
  const [{ t, lang }, viewer] = await Promise.all([getI18n(), getViewer()]);
  if (!canSee(viewer.role, 'projects')) notFound();
  const rows = await visibleProjects(viewer);
  return (
    <>
      <PageHeader screen="projects" />
      <SectionCard title={t('Projects')} hint={String(rows.length)} scroll>
        {rows.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Code')}</Th>
                <Th>{t('Name')}</Th>
                <Th>{t('Entity')}</Th>
                <Th>{t('Priority class')}</Th>
                <Th>{t('Links')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.code}>
                  <Td>
                    {p.code}
                    {p.confidential && <span className="tag tag-neutral" style={{ marginLeft: 8 }}>{t('Confidential')}</span>}
                  </Td>
                  <Td>{dataText(p.name, lang)}</Td>
                  <Td>{dataText(p.entityName, lang)}</Td>
                  <Td>{t(PRIORITY_CLASS_LABEL[p.priorityClass])}</Td>
                  <Td tone="secondary">{[p.keystoneCode && `Keystone ${p.keystoneCode}`, p.codexProgramCode && `Codex ${p.codexProgramCode}`].filter(Boolean).join(' · ') || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No project in your scope.')}</EmptyState>
        )}
      </SectionCard>
    </>
  );
}
