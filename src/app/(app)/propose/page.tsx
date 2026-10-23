// Slot proposals (docs/spec/05 "Proposer", decisions F-3, T-3; delivery 4): the latest run of the engine — who ran it, the
// version of the priority rules it applied —, its proposals with their explanation (rank in the service order, the criteria
// values, validated substitute, working days late, people and equipment) and the needs it could not place, with the reason.
// The R&D director and the coordinator run the engine; a manager of the facility accepts proposals by batch: each becomes a
// confirmed booking after every hard constraint is checked again. Nothing is confirmed by the engine itself. Delivery 5b
// (Keystone's requests screen): filters with their counts, two-line rows with their actions, the engine run in the header.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/app/EmptyState';
import { KpiGrid, KpiTile } from '@/components/app/Kpi';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Segmented } from '@/components/ds/Segmented';
import { Table, Td, Th } from '@/components/ds/Table';
import { canSee } from '@/config/screens';
import { PRIORITY_CRITERION_LABEL, PROPOSAL_STATUS_LABEL, UNPLACED_REASON_LABEL, type PriorityCriterion, type UnplacedReason } from '@/domain/planning-vocabulary';
import { canRunEngine, managedFacilities } from '@/domain/rights';
import { AcceptProposalsForm, RunEngineButton } from '@/features/planning/forms';
import { dataText } from '@/i18n/data-text';
import { fmtDate, fmtInstant, fmtSlot } from '@/lib/format';
import { proposeScreen } from '@/server/dal/planning';
import { getI18n, getViewer } from '@/server/session';

export default async function ProposePage({ searchParams }: PageProps<'/propose'>) {
  const [{ t, lang }, viewer, sp] = await Promise.all([getI18n(), getViewer(), searchParams]);
  if (!canSee(viewer.role, 'propose')) notFound();
  const data = await proposeScreen(viewer);
  const mine = managedFacilities(viewer.role, viewer.assignments);
  const need = (id: string) => data.needs.get(id);
  const what = (id: string) => {
    const n = need(id);
    if (!n) return '—';
    return n.projectCode ? `${n.ref} · ${n.projectCode} · ${dataText(n.title ?? '', lang)}` : `${n.ref} · ${n.confidential ? t('Confidential project') : `${t('Project of')} ${n.entityCode}`}`;
  };
  const allOpen = data.proposals.filter((x) => x.p.status === 'proposed');
  const FILTERS = {
    all: () => true,
    on_time: (x: (typeof allOpen)[number]) => x.p.lateDays === 0,
    late: (x: (typeof allOpen)[number]) => x.p.lateDays > 0,
    substitute: (x: (typeof allOpen)[number]) => x.p.substitute,
  } as const;
  const filter = typeof sp.filter === 'string' && sp.filter in FILTERS ? (sp.filter as keyof typeof FILTERS) : 'all';
  const open = allOpen.filter(FILTERS[filter]);
  const done = data.proposals.filter((x) => x.p.status !== 'proposed');
  // The flags the need meets (regulatory, contractual, no margin left), its priority class and its margin, in the rules order.
  const why = (e: Record<string, unknown>) => {
    const v = (e.criteria ?? {}) as Record<string, number>;
    const parts = data.rules.criteria.flatMap((c) => {
      if (c === 'priority_class') return [`P${v[c]}`];
      if (c === 'slack') return [`${t('margin')} ${v[c]} ${t('working days')}`];
      if (c === 'seniority') return [];
      return v[c] === 0 ? [t(PRIORITY_CRITERION_LABEL[c as PriorityCriterion])] : [];
    });
    return `${t('Rank')} ${e.rank} · ${parts.join(' · ')}`;
  };
  return (
    <>
      <PageHeader
        screen="propose"
        crumbs={['Planning']}
        toolbar={
          <Segmented
            label={t('Filter')}
            value={filter}
            options={[
              { value: 'all', label: t('All'), count: allOpen.length, href: '/propose' },
              { value: 'on_time', label: t('On time'), count: allOpen.filter(FILTERS.on_time).length, href: '/propose?filter=on_time' },
              { value: 'late', label: t('Late'), count: allOpen.filter(FILTERS.late).length, href: '/propose?filter=late' },
              { value: 'substitute', label: t('On a substitute'), count: allOpen.filter(FILTERS.substitute).length, href: '/propose?filter=substitute' },
            ]}
          />
        }
        primary={canRunEngine(viewer.role) ? <><Link href="/conflicts" className="btn btn-secondary">{t('Conflicts & arbitration')}</Link><RunEngineButton /></> : undefined}
      />
      <KpiGrid min={180}>
        <KpiTile label={t('Latest run')} value={data.run?.ref ?? '—'} sub={data.run ? `${fmtInstant(data.run.runAt, lang)} · ${data.run.runByName} · ${t('rules')} v${data.run.ruleVersion}` : t('The engine has not run yet.')} size="lg" />
        <KpiTile label={t('Open proposals')} value={open.length} sub={`${open.filter((x) => x.p.lateDays > 0).length} ${t('late')} · ${open.filter((x) => x.p.substitute).length} ${t('on a validated substitute')}`} size="lg" />
        <KpiTile label={t('Needs not placed')} value={data.unplaced.length} size="lg" />
        <KpiTile label={t('Priority rules')} value={`v${data.rules.version}`} size="lg" sub={t('The engine only proposes: nothing is confirmed without a person.')} />
      </KpiGrid>
      <SectionCard title={t('Proposals')} hint={String(open.length)} subtitle={t('Each proposal respects every hard constraint; its explanation gives its rank in the service order and the values of the first criteria.')} scroll>
        {open.length ? (
          <AcceptProposalsForm
            head={[t('Need'), t('Resource · slot'), t('People · equipment'), t('Deadline'), t('Why this rank')]}
            rows={open.map((x) => {
              const n = need(x.p.needId);
              return {
                id: x.p.id, acceptable: mine.includes(x.facilityCode),
                cells: [
                  { text: n ? `${n.ref} · ${n.projectCode ?? (n.confidential ? t('Confidential project') : `${t('Project of')} ${n.entityCode}`)}` : '—', sub: n?.title ? dataText(n.title, lang) : undefined },
                  { text: `${x.resourceCode}${x.p.substitute ? ` (${t('validated substitute')})` : ''}`, sub: fmtSlot(x.p.startsAt.getTime(), x.p.endsAt.getTime(), lang) },
                  { text: x.p.staff.map((s) => data.people.get(s.personId) ?? '').join(', ') || '—', sub: x.p.equipment.join(', ') || undefined },
                  { text: n ? fmtDate(n.deadlineOn, lang) : '—', tag: x.p.lateDays ? `${x.p.lateDays} ${t('working days late')}` : undefined, sub: x.p.lateDays ? undefined : t('on time') },
                  { text: why(x.p.explanation) },
                ],
              };
            })}
          />
        ) : (
          <EmptyState>{t('No open proposal.')}</EmptyState>
        )}
      </SectionCard>
      {done.length > 0 && (
        <SectionCard title={t('Proposals processed')} hint={String(done.length)} scroll>
          <Table>
            <thead>
              <tr>
                <Th>{t('Need')}</Th>
                <Th>{t('Resource')}</Th>
                <Th>{t('Slot')}</Th>
                <Th>{t('Status')}</Th>
              </tr>
            </thead>
            <tbody>
              {done.map((x) => (
                <tr key={x.p.id}>
                  <Td>{what(x.p.needId)}</Td>
                  <Td>{x.resourceCode}</Td>
                  <Td nowrap>{fmtSlot(x.p.startsAt.getTime(), x.p.endsAt.getTime(), lang)}</Td>
                  <Td>{t(PROPOSAL_STATUS_LABEL[x.p.status])}{x.p.decidedByName ? ` · ${x.p.decidedByName}` : ''}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </SectionCard>
      )}
      <SectionCard title={t('Needs not placed')} hint={String(data.unplaced.length)}>
        {data.unplaced.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Need')}</Th>
                <Th>{t('Deadline')}</Th>
                <Th>{t('Reason')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.unplaced.map((u) => (
                <tr key={u.needId}>
                  <Td>{what(u.needId)}</Td>
                  <Td nowrap>{need(u.needId) ? fmtDate(need(u.needId)!.deadlineOn, lang) : '—'}</Td>
                  <Td>{t(UNPLACED_REASON_LABEL[u.reason as UnplacedReason] ?? u.reason)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('Every open need has a proposal.')}</EmptyState>
        )}
      </SectionCard>
    </>
  );
}
