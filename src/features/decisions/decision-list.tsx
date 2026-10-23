// The decisions waiting for the viewer (delivery 5b, "To decide"): one row per conflict, scenario, lot of proposals and need not
// placed, with the action that settles it. Server component; references and typed text as they are, U-3 masks applied by
// decisionQueue().
import { EmptyState } from '@/components/app/EmptyState';
import { ButtonLink } from '@/components/ds/Button';
import { UNPLACED_REASON_LABEL } from '@/domain/planning-vocabulary';
import { SCENARIO_KIND_LABEL } from '@/domain/recovery-vocabulary';
import { dataText } from '@/i18n/data-text';
import type { Lang, T } from '@/i18n/translate';
import { fmtDate } from '@/lib/format';
import type { DecisionItem } from '@/server/dal/decisions';
import s from './decisions.module.css';

const KIND: Record<DecisionItem['kind'], string> = { conflict: 'Conflict', scenario: 'Scenario', proposals: 'Proposals', unplaced: 'Need not placed' };

export function DecisionList({ items, t, lang, safety }: { items: DecisionItem[]; t: T; lang: Lang; safety: boolean }) {
  if (!items.length) return <EmptyState>{t('Nothing waits for your decision.')}</EmptyState>;
  return (
    <div className={s.list}>
      {items.map((i) => {
        let title: string;
        let sub: string;
        let action: string;
        switch (i.kind) {
          case 'conflict':
            title = [i.ref, i.subject, i.needs.join(' / ')].filter(Boolean).join(' · ');
            sub = i.vetoed ? t('Vetoed by the safety officer: to decide again') : `${t('Decision due on')} ${fmtDate(i.dueOn, lang)}`;
            action = safety ? 'Review' : 'Arbitrate';
            break;
          case 'scenario':
            title = [i.ref, t(SCENARIO_KIND_LABEL[i.scenarioKind as keyof typeof SCENARIO_KIND_LABEL] ?? i.scenarioKind), i.incidentRef].filter(Boolean).join(' · ');
            sub = `${i.moves} ${t('bookings to move')}`;
            action = 'Decide';
            break;
          case 'proposals':
            title = `${i.ref} · ${i.count} ${t('slots proposed by the engine')}`;
            sub = `${i.late} ${t('late')}`;
            action = 'Review';
            break;
          case 'unplaced':
            title = [i.ref, i.projectCode ?? t('Project not visible'), i.title ? dataText(i.title, lang) : null].filter(Boolean).join(' · ');
            sub = t(UNPLACED_REASON_LABEL[i.reason]);
            action = 'See the proposals';
            break;
        }
        return (
          <div key={`${i.kind}-${i.ref}`} className={s.row}>
            <span className={i.kind === 'unplaced' ? 'tag tag-outline' : 'tag tag-accent'}>{t(KIND[i.kind])}</span>
            <span className={s.text}>
              <span className={s.title}>{title}</span>
              <span className={s.sub}>{sub}</span>
            </span>
            <ButtonLink href={i.href} size="sm" nowrap>{t(action)}</ButtonLink>
          </div>
        );
      })}
    </div>
  );
}
