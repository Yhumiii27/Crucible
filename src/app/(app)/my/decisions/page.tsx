// To decide (delivery 5b, after Keystone's "My approvals"): what waits for the viewer's decision — conflict sheets (the safety
// officer: the open ones, to veto), scenarios submitted, the open proposals of the latest engine run, the needs it could not
// place — with the action that settles each.
import { notFound } from 'next/navigation';
import { KpiGrid, KpiTile } from '@/components/app/Kpi';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { canSee } from '@/config/screens';
import { DecisionList } from '@/features/decisions/decision-list';
import { decisionQueue } from '@/server/dal/decisions';
import { getI18n, getViewer } from '@/server/session';

export default async function DecisionsPage() {
  const [{ t, lang }, viewer] = await Promise.all([getI18n(), getViewer()]);
  if (!canSee(viewer.role, 'decide')) notFound();
  const q = await decisionQueue(viewer);
  const count = (k: string) => q.items.filter((i) => i.kind === k).length;
  return (
    <>
      <PageHeader screen="decide" crumbs={['Planning']} />
      <KpiGrid min={170}>
        <KpiTile label={t('Conflicts to arbitrate')} value={count('conflict')} size="lg" />
        <KpiTile label={t('Scenarios to decide')} value={count('scenario')} size="lg" />
        <KpiTile label={t('Proposals to accept')} value={q.openProposals} size="lg" />
        <KpiTile label={t('Needs not placed')} value={count('unplaced')} size="lg" />
      </KpiGrid>
      <SectionCard title={t('To decide')} hint={String(q.items.length)}>
        <DecisionList items={q.items} t={t} lang={lang} safety={viewer.role === 'safety'} />
      </SectionCard>
    </>
  );
}
