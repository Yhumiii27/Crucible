'use client';
// Forms of delivery 4 (client islands of the server pages): people and skills, substitutions, priority rules, test type
// requirements, mobile equipment, the engine run, proposals accepted by batch, conflicts decided or vetoed. Each submits to its
// Server Function and shows the translated result; the Server Functions do every check again.
import { useState } from 'react';
import { ActionButton, ActionForm, Folded } from '@/components/app/ActionForm';
import { Field, Input, Select, Textarea } from '@/components/ds/Field';
import { useI18n } from '@/i18n/client';
import {
  acceptProposalsAction, addAbsenceAction, createEquipmentAction, createPersonAction, createSkillAction, decideConflictAction, proposeSubstitutionAction,
  publishPriorityRulesAction, rejectProposalAction, removeAbsenceAction, removePersonSkillAction, retireSubstitutionAction, runEngineAction, setPersonSkillAction,
  setTestTypeRequirementsAction, syncCursusSkillsAction, validateSubstitutionAction, vetoConflictAction,
} from './actions';
import s from '../resources/forms.module.css';

export interface Opt {
  value: string;
  label: string;
}

export function RunEngineButton({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  return <ActionButton run={runEngineAction} label="Run the engine" done="Proposals computed" variant={variant} />;
}

export function SkillForm() {
  const { t } = useI18n();
  return (
    <ActionForm action={createSkillAction} submit="Add the skill" done="Skill added">
      <Field label={t('Code')} htmlFor="sk-code" required><Input id="sk-code" name="code" required maxLength={24} /></Field>
      <Field label={t('Name')} htmlFor="sk-name" required><Input id="sk-name" name="name" required /></Field>
      <Field label={t('Cursus title')} htmlFor="sk-cursus" hint={t('The title id in Cursus, e.g. habilitation.PYRO')}><Input id="sk-cursus" name="cursusTitreId" /></Field>
    </ActionForm>
  );
}

export function CursusSyncButton() {
  return <ActionButton run={syncCursusSkillsAction} label="Read the titles from Cursus" done="Read" />;
}

export function PersonForm({ entities, facilities }: { entities: Opt[]; facilities: Opt[] }) {
  const { t } = useI18n();
  return (
    <ActionForm action={createPersonAction} submit="Add the person" done="Person added">
      <Field label={t('Name')} htmlFor="pe-name" required><Input id="pe-name" name="name" required /></Field>
      <Field label={t('Entity')} htmlFor="pe-ent" required><Select id="pe-ent" name="entityCode" options={entities} /></Field>
      <Field label={t('Matricule')} htmlFor="pe-mat" hint={t('To read their titles from Cursus')}><Input id="pe-mat" name="matricule" /></Field>
      <Field label={t('Facilities')} htmlFor="pe-fac" required><Select id="pe-fac" name="facilityCodes" multiple options={facilities} /></Field>
    </ActionForm>
  );
}

export function PersonSkillForm({ personId, skills }: { personId: string; skills: Opt[] }) {
  const { t } = useI18n();
  return (
    <ActionForm action={setPersonSkillAction} submit="Give the skill" done="Saved">
      <input type="hidden" name="personId" value={personId} />
      <Field label={t('Skill')} htmlFor={`ps-${personId}`} required><Select id={`ps-${personId}`} name="skillCode" options={skills} /></Field>
      <Field label={t('Valid until')} htmlFor={`pv-${personId}`}><Input id={`pv-${personId}`} name="validUntil" type="date" /></Field>
    </ActionForm>
  );
}

export function RemoveSkillButton({ personId, skillCode }: { personId: string; skillCode: string }) {
  return <ActionButton run={() => removePersonSkillAction(personId, skillCode)} label="Remove" done="Removed" variant="ghost" />;
}

export function AbsenceForm({ personId }: { personId: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={addAbsenceAction} submit="Add the absence" done="Saved">
      <input type="hidden" name="personId" value={personId} />
      <Field label={t('From')} htmlFor={`af-${personId}`} required><Input id={`af-${personId}`} name="fromOn" type="date" required /></Field>
      <Field label={t('To')} htmlFor={`at-${personId}`}><Input id={`at-${personId}`} name="toOn" type="date" /></Field>
    </ActionForm>
  );
}

export function RemoveAbsenceButton({ id }: { id: string }) {
  return <ActionButton run={() => removeAbsenceAction(id)} label="Remove" done="Removed" variant="ghost" />;
}

export function EquipmentForm({ facilityCode }: { facilityCode: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={createEquipmentAction} submit="Add the equipment" done="Equipment added">
      <input type="hidden" name="facilityCode" value={facilityCode} />
      <Field label={t('Code')} htmlFor="eq-code" required><Input id="eq-code" name="code" required maxLength={24} /></Field>
      <Field label={t('Name')} htmlFor="eq-name" required><Input id="eq-name" name="name" required /></Field>
    </ActionForm>
  );
}

export function RequirementsForm({ testTypeCode, skills, equipment, current }: {
  testTypeCode: string; skills: Opt[]; equipment: Opt[]; current: { skills: { skillCode: string; count: number }[]; equipment: string[] };
}) {
  const { t } = useI18n();
  return (
    <Folded summary="Change" size="xs" variant="ghost">
      <ActionForm action={setTestTypeRequirementsAction} submit="Save the requirements" done="Saved">
        <input type="hidden" name="testTypeCode" value={testTypeCode} />
        <div className={s.hours}>
          {skills.map((sk) => {
            const cur = current.skills.find((x) => x.skillCode === sk.value);
            return (
              <label key={sk.value} className={s.day}>
                <input type="checkbox" name="skillCodes" value={sk.value} defaultChecked={!!cur} />
                <span>{sk.label}</span>
                <Input name={`count-${sk.value}`} type="number" min={1} max={5} defaultValue={cur?.count ?? 1} aria-label={`${sk.label} · ${t('People')}`} />
              </label>
            );
          })}
        </div>
        <Field label={t('Mobile equipment')} htmlFor={`rq-eq-${testTypeCode}`}>
          <Select id={`rq-eq-${testTypeCode}`} name="equipmentCodes" multiple defaultValue={current.equipment} options={equipment} />
        </Field>
      </ActionForm>
    </Folded>
  );
}

export function SubstitutionForm({ testTypes, resources }: { testTypes: Opt[]; resources: Opt[] }) {
  const { t } = useI18n();
  return (
    <ActionForm action={proposeSubstitutionAction} submit="Propose the substitution" done="Substitution proposed: awaiting validation">
      <Field label={t('Test type')} htmlFor="su-type" required><Select id="su-type" name="testTypeCode" options={testTypes} /></Field>
      <Field label={t('Substitute resource')} htmlFor="su-res" required><Select id="su-res" name="resourceId" options={resources} /></Field>
      <Field label={t('Conditions')} htmlFor="su-cond" required><Textarea id="su-cond" name="conditions" short required /></Field>
      <Field label={t('Codex reference of the technical justification')} htmlFor="su-codex" required><Input id="su-codex" name="codexRef" required /></Field>
      <Field label={t('Technical referent of the test type')} htmlFor="su-ref" required><Input id="su-ref" name="technicalReferent" required /></Field>
      <Field label={t('Hazardous matter')} htmlFor="su-haz" hint={t('The safety officer’s opinion is then asked')}><input id="su-haz" type="checkbox" name="hazardous" /></Field>
    </ActionForm>
  );
}

export function ValidateSubstitutionButton({ id, label }: { id: string; label: string }) {
  return <ActionButton run={() => validateSubstitutionAction(id)} label={label} done="Saved" variant="primary" />;
}

export function RetireSubstitutionForm({ id }: { id: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={retireSubstitutionAction} submit="Retire" done="Retired" inline variant="ghost">
      <input type="hidden" name="substitutionId" value={id} />
      <Input size="inline" name="reason" placeholder={t('Reason')} aria-label={t('Reason')} required />
    </ActionForm>
  );
}

export function PriorityRulesForm({ order, criteria }: { order: string[]; criteria: Opt[] }) {
  const { t } = useI18n();
  return (
    <Folded summary="Publish a new version" size="xs" variant="ghost">
      <ActionForm action={publishPriorityRulesAction} submit="Publish the rules" done="Rules published">
        {order.map((c, i) => (
          <Field key={i} label={`${t('Rank')} ${i + 1}`} htmlFor={`pr-${i}`}>
            <Select id={`pr-${i}`} name={`criterion${i + 1}`} defaultValue={c} options={criteria} />
          </Field>
        ))}
        <Field label={t('Note')} htmlFor="pr-note"><Input id="pr-note" name="note" /></Field>
      </ActionForm>
    </Folded>
  );
}

export interface ProposalRow {
  id: string;
  /** Each cell: its text and an optional second line (translated or typed, already displayed). */
  cells: { text: string; sub?: string; tag?: string }[];
  acceptable: boolean;
}

/**
 * Proposals with a box each: the checked ones are accepted together (F-3: confirmation by batch); each row can also be refused.
 * Delivery 5b: Keystone's table — two-line cells, a tag for the delay, the row's actions at the end.
 */
export function AcceptProposalsForm({ head, rows }: { head: string[]; rows: ProposalRow[] }) {
  const { t } = useI18n();
  const [all, setAll] = useState(true);
  const any = rows.some((r) => r.acceptable);
  return (
    <ActionForm action={acceptProposalsAction} submit="Accept the proposals checked" done="Proposals processed">
      <div style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>{any && <input type="checkbox" aria-label={t('All')} checked={all} onChange={(e) => setAll(e.target.checked)} />}</th>
              {head.map((h) => <th key={h}>{h}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.acceptable && <input type="checkbox" name="proposalIds" value={r.id} defaultChecked={all} key={String(all)} aria-label={r.cells[0]?.text} />}</td>
                {r.cells.map((c, i) => (
                  <td key={i}>
                    <div className={s.cell}>
                      <span>{c.text}</span>
                      {c.tag && <span className="tag tag-accent">{c.tag}</span>}
                      {c.sub && <span className={s.cellSub}>{c.sub}</span>}
                    </div>
                  </td>
                ))}
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.acceptable && <RejectProposalButton id={r.id} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ActionForm>
  );
}

export function RejectProposalButton({ id }: { id: string }) {
  return <ActionButton run={() => rejectProposalAction(id)} label="Reject" done="Rejected" variant="ghost" />;
}

export function DecideConflictForm({ conflictId, options, recommendedKey }: { conflictId: string; options: Opt[]; recommendedKey: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={decideConflictAction} submit="Decide" done="Decision recorded">
      <input type="hidden" name="conflictId" value={conflictId} />
      <Field label={t('Option')} htmlFor={`dc-${conflictId}`} required>
        <Select id={`dc-${conflictId}`} name="optionKey" defaultValue={recommendedKey} options={options} />
      </Field>
      <Field label={t('Reason')} htmlFor={`dr-${conflictId}`} required><Input id={`dr-${conflictId}`} name="reason" required /></Field>
    </ActionForm>
  );
}

export function VetoForm({ conflictId }: { conflictId: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={vetoConflictAction} submit="Veto the decision" done="Decision vetoed" inline variant="ghost">
      <input type="hidden" name="conflictId" value={conflictId} />
      <Input size="inline" name="reason" placeholder={t('Reason')} aria-label={t('Reason')} required />
    </ActionForm>
  );
}
