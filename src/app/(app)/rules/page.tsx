// Rules (docs/spec/05): exclusion rules — proposed by the coordinator or a facility manager, validated or retired by the safety
// officer (R-3), applied to every booking once validated — and the sharing agreements of the facilities with partner entities,
// set by the R&D director (A-3) — and the test type catalogue (D-3, delivery 3), kept by the coordinator and the R&D director.
// Delivery 4: the skills and equipment each test type asks (F-7, R-8), the substitutions between resources (proposed by a
// manager, validated by the host facility's manager with the technical referent, and the safety officer for hazardous matter,
// R-4) and the versions of the priority rules (published by the R&D director, A-1, A-2).
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Tag } from '@/components/ds/Tag';
import { Table, Td, Th } from '@/components/ds/Table';
import { canSee } from '@/config/screens';
import { RULE_REASON_LABEL, RULE_STATUS_LABEL, type RuleReason } from '@/domain/resources';
import { PRIORITY_CRITERIA, PRIORITY_CRITERION_LABEL, SUBSTITUTION_STATUS_LABEL, type PriorityCriterion } from '@/domain/planning-vocabulary';
import { canEditTestTypes, canPublishPriorityRules, managedFacilities } from '@/domain/rights';
import { PriorityRulesForm, RequirementsForm, RetireSubstitutionForm, SubstitutionForm, ValidateSubstitutionButton } from '@/features/planning/forms';
import { TestTypeActiveButton, TestTypeForm } from '@/features/needs/forms';
import { AgreementForm, ProposeRuleForm, RetireRuleForm, ValidateRuleButton } from '@/features/resources/forms';
import { dataText } from '@/i18n/data-text';
import { fmtDate } from '@/lib/format';
import { testTypeCatalogue } from '@/server/dal/needs';
import { planningRules } from '@/server/dal/planning';
import { rulesScreen } from '@/server/dal/resources';
import { getI18n, getViewer } from '@/server/session';

export default async function RulesPage() {
  const [{ t, lang }, viewer] = await Promise.all([getI18n(), getViewer()]);
  if (!canSee(viewer.role, 'rules')) notFound();
  const [data, types, plan] = await Promise.all([rulesScreen(viewer), testTypeCatalogue(), planningRules()]);
  const editTypes = canEditTestTypes(viewer.role);
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

      <SectionCard title={t('Test types')} hint={String(types.length)} subtitle={t('The catalogue of the tests practised: nominal resource, usual length, skills required. Choosing a type in a need proposes them.')} scroll>
        {types.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Code')}</Th>
                <Th>{t('Name')}</Th>
                <Th>{t('Nominal resource')}</Th>
                <Th align="right">{t('Usual length (half-days)')}</Th>
                <Th>{t('Skills required')}</Th>
                <Th>{t('Planned with')}</Th>
                <Th>{t('Status')}</Th>
              </tr>
            </thead>
            <tbody>
              {types.map(({ t: x, resourceCode }) => (
                <tr key={x.code}>
                  <Td>{x.code}</Td>
                  <Td>{dataText(x.name, lang)}</Td>
                  <Td>{resourceCode ?? '—'}</Td>
                  <Td align="right" numeric>{x.typicalHalfDays}</Td>
                  <Td tone="secondary">{x.skills ? dataText(x.skills, lang) : '—'}</Td>
                  <Td>
                    {(() => {
                      const req = plan.requirements.get(x.code) ?? { skills: [], equipment: [] };
                      const text = [...req.skills.map((k) => `${k.count} × ${k.skillCode}`), ...req.equipment].join(' · ');
                      return (
                        <>
                          {text || '—'}
                          {editTypes && x.active && (
                            <RequirementsForm testTypeCode={x.code} current={{ skills: req.skills, equipment: req.equipment }}
                              skills={plan.skills.map((k) => ({ value: k.code, label: `${k.code} · ${dataText(k.name, lang)}` }))}
                              equipment={plan.equipment.map((e) => ({ value: e.code, label: `${e.code} · ${dataText(e.name, lang)}` }))} />
                          )}
                        </>
                      );
                    })()}
                  </Td>
                  <Td>
                    {x.active ? t('In the catalogue') : t('Withdrawn from the catalogue')}
                    {editTypes && <> <TestTypeActiveButton code={x.code} active={x.active} /></>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No test type yet.')}</EmptyState>
        )}
        {editTypes && <TestTypeForm resources={data.resources.map((r) => ({ id: r.id, code: r.code, name: dataText(r.name, lang) }))} />}
      </SectionCard>

      <SectionCard title={t('Substitutions')} hint={String(plan.substitutions.length)} subtitle={t('A test type on another resource than its nominal one. The engine proposes a validated substitution only: the host facility’s manager validates, with the technical referent and the Codex justification; the safety officer’s opinion is asked for hazardous matter (R-4).')} scroll>
        {plan.substitutions.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Test type')}</Th>
                <Th>{t('Substitute resource')}</Th>
                <Th>{t('Conditions')}</Th>
                <Th>{t('Validations')}</Th>
                <Th>{t('Status')}</Th>
              </tr>
            </thead>
            <tbody>
              {plan.substitutions.map(({ s: x, resourceCode, facilityCode }) => {
                const host = mine.includes(facilityCode);
                return (
                  <tr key={x.id}>
                    <Td valign="top">{x.testTypeCode}</Td>
                    <Td valign="top">{resourceCode}</Td>
                    <Td valign="top">{dataText(x.conditions, lang)}<div className="text-muted">{x.codexRef} · {t('Technical referent')} {x.technicalReferent}{x.hazardous ? ` · ${t('Hazardous matter')}` : ''}</div></Td>
                    <Td valign="top">
                      <div>{t('Host facility')} : {x.hostValidatedByName ?? '—'}</div>
                      {x.hazardous && <div>{t('Safety officer')} : {x.safetyValidatedByName ?? '—'}</div>}
                    </Td>
                    <Td valign="top">
                      <Tag size="sm" tone={x.status === 'validated' ? 'accent' : x.status === 'proposed' ? 'outline' : 'neutral'}>{t(SUBSTITUTION_STATUS_LABEL[x.status])}</Tag>
                      {x.status === 'proposed' && host && !x.hostValidatedByName && <ValidateSubstitutionButton id={x.id} label="Validate (host facility)" />}
                      {x.status === 'proposed' && safety && x.hazardous && !x.safetyValidatedByName && <ValidateSubstitutionButton id={x.id} label="Give the safety opinion" />}
                      {x.status !== 'retired' && (host || safety) && <RetireSubstitutionForm id={x.id} />}
                      {x.retiredReason && <div className="text-muted">{dataText(x.retiredReason, lang)}</div>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No substitution.')}</EmptyState>
        )}
        {mine.length > 0 && (
          <SubstitutionForm testTypes={types.filter(({ t: x }) => x.active).map(({ t: x }) => ({ value: x.code, label: `${x.code} · ${dataText(x.name, lang)}` }))}
            resources={data.resources.map((r) => ({ value: r.id, label: `${r.code} · ${dataText(r.name, lang)}` }))} />
        )}
      </SectionCard>

      <SectionCard title={t('Priority rules')} subtitle={t('The order in which the engine serves the needs and that ranks the options of a conflict. Each version is kept; each proposal and each conflict cites the version that produced it (A-1).')}>
        {plan.versions.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Version')}</Th>
                <Th>{t('Order of the criteria')}</Th>
                <Th>{t('Published')}</Th>
              </tr>
            </thead>
            <tbody>
              {plan.versions.map((v) => (
                <tr key={v.version}>
                  <Td valign="top">v{v.version}</Td>
                  <Td valign="top">{v.criteria.map((c, i) => `${i + 1}. ${t(PRIORITY_CRITERION_LABEL[c as PriorityCriterion])}`).join(' · ')}{v.note && <div className="text-muted">{dataText(v.note, lang)}</div>}</Td>
                  <Td valign="top" nowrap>{fmtDate(v.publishedAt, lang)} · {v.publishedByName}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('Starting order (A-2) in force.')}</EmptyState>
        )}
        {canPublishPriorityRules(viewer.role) && (
          <PriorityRulesForm order={(plan.versions[0]?.criteria ?? [...PRIORITY_CRITERIA]) as string[]} criteria={PRIORITY_CRITERIA.map((c) => ({ value: c, label: t(PRIORITY_CRITERION_LABEL[c]) }))} />
        )}
      </SectionCard>
    </>
  );
}
