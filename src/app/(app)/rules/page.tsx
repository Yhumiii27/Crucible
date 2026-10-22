// Rules (docs/spec/05): exclusion rules — proposed by the coordinator or a facility manager, validated or retired by the safety
// officer (R-3), applied to every booking once validated — and the sharing agreements of the facilities with partner entities,
// set by the R&D director (A-3).
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Tag } from '@/components/ds/Tag';
import { Table, Td, Th } from '@/components/ds/Table';
import { canSee } from '@/config/screens';
import { RULE_REASON_LABEL, RULE_STATUS_LABEL, type RuleReason } from '@/domain/resources';
import { managedFacilities } from '@/domain/rights';
import { AgreementForm, ProposeRuleForm, RetireRuleForm, ValidateRuleButton } from '@/features/resources/forms';
import { dataText } from '@/i18n/data-text';
import { fmtDate } from '@/lib/format';
import { rulesScreen } from '@/server/dal/resources';
import { getI18n, getViewer } from '@/server/session';

export default async function RulesPage() {
  const [{ t, lang }, viewer] = await Promise.all([getI18n(), getViewer()]);
  if (!canSee(viewer.role, 'rules')) notFound();
  const data = await rulesScreen(viewer);
  const safety = viewer.role === 'safety';
  const mine = managedFacilities(viewer.role, viewer.assignments);
  const proposable = safety ? data.resources : data.resources.filter((r) => mine.includes(r.facilityCode));
  const pairs = data.facilities.flatMap((f) => f.partnerEntityCodes.map((entityCode) => ({ facilityCode: f.code, entityCode })));
  const entityName = new Map(data.entities.map((e) => [e.code, e.name]));
  return (
    <>
      <PageHeader screen="rules" />
      <SectionCard title={t('Exclusion rules')} hint={String(data.rules.length)} subtitle={t('Of the resources a rule names, no more than the number given work at the same time. A booking a validated rule forbids is refused, citing the rule.')} scroll>
        {data.rules.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Code')}</Th>
                <Th>{t('Rule')}</Th>
                <Th>{t('Resources')}</Th>
                <Th align="right">{t('At most active')}</Th>
                <Th>{t('Reason')}</Th>
                <Th>{t('Status')}</Th>
                {safety && <Th />}
              </tr>
            </thead>
            <tbody>
              {data.rules.map((r) => (
                <tr key={r.id}>
                  <Td valign="top">{r.code}</Td>
                  <Td valign="top">
                    <div>{dataText(r.label, lang)}</div>
                    <div className="text-muted">{dataText(r.motive, lang)}</div>
                    {r.codexRef && <div className="text-muted">Codex {r.codexRef}</div>}
                  </Td>
                  <Td valign="top">{r.resourceCodes.join(', ')}</Td>
                  <Td valign="top" align="right" numeric>{r.maxActive}</Td>
                  <Td valign="top">{t(RULE_REASON_LABEL[r.reason as RuleReason] ?? r.reason)}</Td>
                  <Td valign="top">
                    <Tag tone={r.status === 'validated' ? 'accent' : r.status === 'proposed' ? 'outline' : 'neutral'} size="sm">{t(RULE_STATUS_LABEL[r.status])}</Tag>
                    <div className="text-muted">
                      {r.status === 'validated' && r.validatedByName ? `${r.validatedByName} · ${fmtDate(r.validatedAt, lang)}` : `${t('Proposed by')} ${r.proposedByName}`}
                    </div>
                    {r.retiredReason && <div className="text-muted">{r.retiredReason}</div>}
                  </Td>
                  {safety && (
                    <Td valign="top">
                      {r.status === 'proposed' && <ValidateRuleButton id={r.id} />}
                      {r.status !== 'retired' && <RetireRuleForm id={r.id} />}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No exclusion rule.')}</EmptyState>
        )}
        {proposable.length > 1 && <ProposeRuleForm resources={proposable.map((r) => ({ id: r.id, code: r.code }))} />}
      </SectionCard>

      <SectionCard title={t('Sharing agreements')} subtitle={t('Quota and notice agreed with each partner entity on a shared facility. A request with less notice is accepted with a warning.')} scroll>
        {data.agreements.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Facility')}</Th>
                <Th>{t('Entity')}</Th>
                <Th align="right">{t('Quota (days per month)')}</Th>
                <Th align="right">{t('Notice (working days)')}</Th>
                <Th>{t('Note')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.agreements.map((a) => (
                <tr key={`${a.facilityCode}-${a.entityCode}`}>
                  <Td>{a.facilityCode}</Td>
                  <Td>{dataText(entityName.get(a.entityCode) ?? a.entityCode, lang)}</Td>
                  <Td align="right" numeric>{a.quotaDaysPerMonth ?? '—'}</Td>
                  <Td align="right" numeric>{a.noticeWorkdays}</Td>
                  <Td tone="secondary">{a.note ? dataText(a.note, lang) : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No sharing agreement.')}</EmptyState>
        )}
        {viewer.role === 'rd_director' && pairs.length > 0 && <AgreementForm pairs={pairs} />}
      </SectionCard>
    </>
  );
}
