// Conflicts & arbitration (docs/spec/03 §5, 05 "Conflits", decisions A-4, A-6; delivery 4): each sheet written by the engine —
// the needs in competition, the options with their consequences for every need (resource, slot, validated substitute, working
// days late), the priority rule that orders them and its rank in the rules version, the recommendation, who decides and by
// when. The coordinator decides when no option delays a critical need, else the R&D director; the safety officer may veto a
// decision. Decisions are never changed: a new one replaces the previous, and the next run serves the needs in that order.
// Delivery 5b (Keystone's what-if levelling): the options side by side, the recommended one outlined, their consequences per
// need, then the decision.
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Tag } from '@/components/ds/Tag';
import { ROLE_LABEL, type RoleKey } from '@/config/roles';
import { canSee } from '@/config/screens';
import { canDecide } from '@/domain/conflicts';
import { CONFLICT_STATUS_LABEL, PRIORITY_CRITERION_LABEL, type PriorityCriterion } from '@/domain/planning-vocabulary';
import { AskButton } from '@/features/assistant/panel';
import { DecideConflictForm, VetoForm } from '@/features/planning/forms';
import { minutesOfTurn } from '@/server/assistant/service';
import { dataText } from '@/i18n/data-text';
import { fmtDate, fmtInstant, fmtSlot } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { conflictsScreen, type OptionView } from '@/server/dal/planning';
import { getI18n, getViewer } from '@/server/session';
import s from './conflicts.module.css';

export default async function ConflictsPage({ searchParams }: PageProps<'/conflicts'>) {
  const [{ t, lang }, viewer, today, sp] = await Promise.all([getI18n(), getViewer(), businessToday(), searchParams]);
  if (!canSee(viewer.role, 'conflicts')) notFound();
  const data = await conflictsScreen(viewer);
  // Opened from the assistant (delivery 6): the decision of that conflict starts from the minutes it drafted.
  const minutes = typeof sp.turn === 'string' ? await minutesOfTurn(viewer, sp.turn) : null;
  const label = (id: string) => {
    const n = data.needs.get(id);
    if (!n) return '—';
    return n.projectCode ? `${n.ref} · ${n.projectCode}` : `${n.ref} · ${n.confidential ? t('Confidential project') : n.entityCode}`;
  };
  const optionLabel = (o: OptionView) => `${o.key === 'as_proposed' ? t('As proposed') : t('Served first')} · ${o.orderRefs.join(' → ')}`;
  const rule = (c: (typeof data.conflicts)[number]) =>
    c.ruleCited === 'tie' ? t('Equal on every criterion: a person decides') : `${t(PRIORITY_CRITERION_LABEL[c.ruleCited as PriorityCriterion])} · ${t('rank')} ${c.ruleRank} · ${t('rules')} v${c.ruleVersion}`;
  const active = data.conflicts.filter((c) => c.status === 'open' || c.status === 'vetoed');
  const others = data.conflicts.filter((c) => c.status !== 'open' && c.status !== 'vetoed');
  const letter = (i: number) => String.fromCharCode(65 + i);
  const sheet = (c: (typeof data.conflicts)[number]) => {
    const live = c.status === 'open' || c.status === 'vetoed';
    const late = live && c.dueOn < today;
    const lateOf = (o: OptionView) => o.outcomes.reduce((a, x) => a + (x.lateDays ?? 0), 0);
    const asProposed = c.options.find((o) => o.key === 'as_proposed');
    const recommended = c.options.find((o) => o.key === c.recommendedKey);
    return (
      <SectionCard key={c.id} title={`${c.ref} · ${c.subject}`}
        actions={<><AskButton question={{ fr: `Explique le conflit ${c.ref} et prépare le compte rendu de l’arbitrage`, en: `Explain conflict ${c.ref} and draft the minutes of its arbitration` }} label="Explain" /><Tag tone={live ? 'accent' : 'neutral'} size="sm">{t(CONFLICT_STATUS_LABEL[c.status])}</Tag></>}
        subtitle={`${t('Needs in competition')} : ${c.needIds.map(label).join(' / ')}`}>
        <div className={s.facts}>
          <div className={s.fact}><span className={s.factLabel}>{t('Rule cited')}</span><span className={s.factValue}>{rule(c)}</span></div>
          <div className={s.fact}><span className={s.factLabel}>{t('Decides')}</span><span className={s.factValue}>{t(ROLE_LABEL[c.decider as RoleKey])}</span></div>
          <div className={s.fact}>
            <span className={s.factLabel}>{t('Decision expected by')}</span>
            <span className={s.factValue}>{fmtDate(c.dueOn, lang)}</span>
            {late && <Tag tone="accent" size="xs">{t('Overdue: remind the decider, then their superior (A-6)')}</Tag>}
          </div>
          {asProposed && recommended && (
            <div className={s.fact}><span className={s.factLabel}>{t('Working days late')}</span><span className={s.factValue}>{lateOf(asProposed)} → {lateOf(recommended)}</span><span className={s.factSub}>{t('as proposed → recommended')}</span></div>
          )}
        </div>
        <div className={s.options}>
          {c.options.map((o, i) => {
            const rec = o.key === c.recommendedKey;
            return (
              <div key={o.key} className={rec ? `${s.option} ${s.recommended}` : s.option}>
                <div className={s.optHead}>
                  <span className={s.optTitle}>{`${t('Option')} ${letter(i)} · ${o.key === 'as_proposed' ? t('As proposed') : t('Served first')}`}</span>
                  {rec && <Tag tone="accent" size="sm">{t('Recommended')}</Tag>}
                </div>
                <span className={s.factLabel}>{t('Service order')}</span>
                <span className={s.order}>{o.orderRefs.join(' → ')}</span>
                <span className={s.factLabel}>{t('Consequences per need')}</span>
                {c.needIds.map((id) => {
                  const oc = o.outcomes.find((x) => x.needId === id);
                  return (
                    <div key={id} className={s.effect}>
                      <span className={s.effectNeed}>{label(id)}</span>
                      {oc && oc.lateDays != null && oc.lateDays > 0 ? <Tag tone="accent" size="xs">{`${oc.lateDays} ${t('working days late')}`}</Tag> : <span className={s.factSub}>{oc?.lateDays == null ? t('Not placed') : t('on time')}</span>}
                      <span className={s.effectSlot}>{oc && oc.lateDays != null ? `${data.resourceCode.get(oc.resourceId ?? '') ?? ''}${oc.substitute ? ` (${t('validated substitute')})` : ''} · ${fmtSlot(oc.start!, oc.end!, lang)}` : '—'}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {c.decisions.map((d) => (
          <div key={d.id} className="text-muted" style={{ fontSize: 12.5 }}>
            {fmtInstant(d.decidedAt, lang)} · {d.decidedByName} ({t(ROLE_LABEL[d.decidedByRole as RoleKey])}) · {d.kind === 'veto' ? t('Veto') : `${t('Decision')} : ${optionLabel(c.options.find((o) => o.key === d.optionKey) ?? { key: d.optionKey ?? '', orderRefs: [], outcomes: [] })}`} — {dataText(d.reason, lang)}
          </div>
        ))}
        {live && canDecide(viewer.role, c.decider) && (
          <div className={s.decide}>
            <DecideConflictForm conflictId={c.id} recommendedKey={c.recommendedKey} minutes={minutes?.conflictRef === c.ref ? { text: minutes.text, turnId: minutes.turnId } : undefined} options={c.options.map((o, i) => ({ value: o.key, label: `${t('Option')} ${letter(i)} · ${optionLabel(o)}${o.key === c.recommendedKey ? ` (${t('Recommended')})` : ''}` }))} />
            <span className="text-muted" style={{ fontSize: 12 }}>{t('The reason is kept in the journal and never changed. The safety officer may veto; the sheet is then to decide again. The next engine run serves the needs in the order decided.')}</span>
          </div>
        )}
        {c.status === 'decided' && viewer.role === 'safety' && <VetoForm conflictId={c.id} />}
      </SectionCard>
    );
  };
  return (
    <>
      <PageHeader screen="conflicts" crumbs={['Planning']} />
      {active.length ? active.map(sheet) : <SectionCard title={t('To arbitrate')}><EmptyState>{t('No conflict to arbitrate.')}</EmptyState></SectionCard>}
      {others.length > 0 && others.map(sheet)}
    </>
  );
}
