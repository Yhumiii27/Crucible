// Conflicts & arbitration (docs/spec/03 §5, 05 "Conflits", decisions A-4, A-6; delivery 4): each sheet written by the engine —
// the needs in competition, the options with their consequences for every need (resource, slot, validated substitute, working
// days late), the priority rule that orders them and its rank in the rules version, the recommendation, who decides and by
// when. The coordinator decides when no option delays a critical need, else the R&D director; the safety officer may veto a
// decision. Decisions are never changed: a new one replaces the previous, and the next run serves the needs in that order.
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Tag } from '@/components/ds/Tag';
import { Table, Td, Th } from '@/components/ds/Table';
import { ROLE_LABEL, type RoleKey } from '@/config/roles';
import { canSee } from '@/config/screens';
import { canDecide } from '@/domain/conflicts';
import { CONFLICT_STATUS_LABEL, PRIORITY_CRITERION_LABEL, type PriorityCriterion } from '@/domain/planning-vocabulary';
import { DecideConflictForm, VetoForm } from '@/features/planning/forms';
import { dataText } from '@/i18n/data-text';
import { fmtDate, fmtInstant, fmtSlot } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { conflictsScreen, type OptionView } from '@/server/dal/planning';
import { getI18n, getViewer } from '@/server/session';

export default async function ConflictsPage() {
  const [{ t, lang }, viewer, today] = await Promise.all([getI18n(), getViewer(), businessToday()]);
  if (!canSee(viewer.role, 'conflicts')) notFound();
  const data = await conflictsScreen(viewer);
  const label = (id: string) => {
    const n = data.needs.get(id);
    if (!n) return '—';
    return n.projectCode ? `${n.ref} · ${n.projectCode}` : `${n.ref} · ${n.confidential ? t('Confidential project') : n.entityCode}`;
  };
  const optionLabel = (o: OptionView) => `${o.key === 'as_proposed' ? t('As proposed') : t('Served first')} · ${o.orderRefs.join(' → ')}`;
  const outcome = (o: OptionView['outcomes'][number]) =>
    o.lateDays == null ? t('Not placed')
      : `${data.resourceCode.get(o.resourceId ?? '') ?? ''}${o.substitute ? ` (${t('validated substitute')})` : ''} · ${fmtSlot(o.start!, o.end!, lang)} · ${o.lateDays ? `${o.lateDays} ${t('working days late')}` : t('on time')}`;
  const rule = (c: (typeof data.conflicts)[number]) =>
    c.ruleCited === 'tie' ? t('Equal on every criterion: a person decides') : `${t(PRIORITY_CRITERION_LABEL[c.ruleCited as PriorityCriterion])} · ${t('rank')} ${c.ruleRank} · ${t('rules')} v${c.ruleVersion}`;
  const active = data.conflicts.filter((c) => c.status === 'open' || c.status === 'vetoed');
  const others = data.conflicts.filter((c) => c.status !== 'open' && c.status !== 'vetoed');
  const sheet = (c: (typeof data.conflicts)[number]) => {
    const late = (c.status === 'open' || c.status === 'vetoed') && c.dueOn < today;
    return (
      <SectionCard key={c.id} title={`${c.ref} · ${c.subject}`} hint={t(CONFLICT_STATUS_LABEL[c.status])}
        subtitle={`${t('Needs in competition')} : ${c.needIds.map(label).join(' / ')}`}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
          <span>{t('Rule')} : <strong>{rule(c)}</strong></span>
          <span>{t('Decides')} : {t(ROLE_LABEL[c.decider as RoleKey])}</span>
          <span>{t('Decision expected by')} {fmtDate(c.dueOn, lang)}</span>
          {late && <Tag tone="accent" size="sm">{t('Overdue: remind the decider, then their superior (A-6)')}</Tag>}
        </div>
        <Table>
          <thead>
            <tr>
              <Th>{t('Option')}</Th>
              {c.needIds.map((id) => <Th key={id}>{label(id)}</Th>)}
            </tr>
          </thead>
          <tbody>
            {c.options.map((o) => (
              <tr key={o.key}>
                <Td valign="top">
                  {optionLabel(o)}
                  {o.key === c.recommendedKey && <div><Tag tone="accent-2" size="xs">{t('Recommended')}</Tag></div>}
                </Td>
                {c.needIds.map((id) => {
                  const oc = o.outcomes.find((x) => x.needId === id);
                  return <Td key={id} valign="top">{oc ? outcome(oc) : '—'}</Td>;
                })}
              </tr>
            ))}
          </tbody>
        </Table>
        {c.decisions.map((d) => (
          <div key={d.id} className="text-muted" style={{ fontSize: 12.5 }}>
            {fmtInstant(d.decidedAt, lang)} · {d.decidedByName} ({t(ROLE_LABEL[d.decidedByRole as RoleKey])}) · {d.kind === 'veto' ? t('Veto') : `${t('Decision')} : ${optionLabel(c.options.find((o) => o.key === d.optionKey) ?? { key: d.optionKey ?? '', orderRefs: [], outcomes: [] })}`} — {dataText(d.reason, lang)}
          </div>
        ))}
        {(c.status === 'open' || c.status === 'vetoed') && canDecide(viewer.role, c.decider) && (
          <DecideConflictForm conflictId={c.id} recommendedKey={c.recommendedKey} options={c.options.map((o) => ({ value: o.key, label: optionLabel(o) }))} />
        )}
        {c.status === 'decided' && viewer.role === 'safety' && <VetoForm conflictId={c.id} />}
      </SectionCard>
    );
  };
  return (
    <>
      <PageHeader screen="conflicts" />
      {active.length ? active.map(sheet) : <SectionCard title={t('To arbitrate')}><EmptyState>{t('No conflict to arbitrate.')}</EmptyState></SectionCard>}
      {others.length > 0 && others.map(sheet)}
    </>
  );
}
