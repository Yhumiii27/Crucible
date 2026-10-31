// Connectors (docs/spec/05 "Administration"; delivery 3): the pub_ views of the other tools Crucible reads — and whether they
// exist and are granted on this server — and the views Crucible publishes. Until a view is readable, Crucible works from what
// is entered in it (S-1: milestones entered; S-3: operators typed). Rights are granted by Matrix (registry matrix.liens, M-17).
// Keystone milestones, Cursus absences and Vigie inspections are copied every hour once readable (CR-060), or on demand.
import { notFound } from 'next/navigation';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Tag } from '@/components/ds/Tag';
import { Table, Td, Th } from '@/components/ds/Table';
import { PUBLISHED_VIEWS, READ_CONNECTORS, type ConnectorDef } from '@/config/connectors';
import { canSee } from '@/config/screens';
import { ReadConnectorsButton } from '@/features/admin/forms';
import { connectorStates, type ConnectorState } from '@/server/dal/connectors';
import { getI18n, getViewer } from '@/server/session';

const STATE_LABEL: Record<ConnectorState, string> = { readable: 'Readable', not_granted: 'Not granted to Crucible', absent: 'Not published yet' };

export default async function ConnectorsPage() {
  const [{ t }, viewer] = await Promise.all([getI18n(), getViewer()]);
  if (!canSee(viewer.role, 'admin-connectors')) notFound();
  const states = await connectorStates();
  const table = (rows: readonly (ConnectorDef & { readers?: string })[], published: boolean) => (
    <Table>
      <thead>
        <tr>
          <Th>{t('View')}</Th>
          <Th>{published ? t('Read by') : t('Tool')}</Th>
          <Th>{t('Use')}</Th>
          <Th>{t('Request')}</Th>
          <Th>{t('Delivery')}</Th>
          <Th>{t('State')}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => {
          const st = states.get(c.view) ?? 'absent';
          return (
            <tr key={c.view}>
              <Td><code>{c.view}</code></Td>
              <Td>{published ? c.readers : c.tool}</Td>
              <Td>{t(c.use)}</Td>
              <Td tone="secondary">{c.request}</Td>
              <Td tone="secondary">{c.delivery}</Td>
              <Td><Tag size="sm" tone={st === 'readable' ? 'accent' : 'outline'}>{t(STATE_LABEL[st])}</Tag></Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
  return (
    <>
      <PageHeader screen="admin-connectors" crumbs={['Administration']} primary={<ReadConnectorsButton />} />
      <SectionCard title={t('Views Crucible reads')} subtitle={t('Until a view is readable, Crucible works from what is entered in it. Keystone milestones, Cursus absences and Vigie inspections are read every hour once readable. Rights are granted by Matrix.')} scroll>
        {table(READ_CONNECTORS, false)}
      </SectionCard>
      <SectionCard title={t('Views Crucible publishes')} subtitle={t('Contracts: a column is never removed nor renamed; new columns go at the end.')} scroll>
        {table(PUBLISHED_VIEWS, true)}
      </SectionCard>
    </>
  );
}
