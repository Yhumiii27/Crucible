'use client';
// Forms of delivery 3 (client islands of the server pages): milestones, test needs, the test type catalogue and the Codex
// reference of a test report. Each submits to its Server Function and shows the translated result and warnings; the Server
// Functions do every check again.
import { useState } from 'react';
import { ActionButton, ActionForm, Folded } from '@/components/app/ActionForm';
import { Field, Input, Select, Textarea } from '@/components/ds/Field';
import { MILESTONE_CRITICALITIES, MILESTONE_CRITICALITY_LABEL, NEED_LEVELS, NEED_LEVEL_LABEL, type MilestoneCriticality, type NeedLevel } from '@/domain/needs';
import { useI18n } from '@/i18n/client';
import {
  addMilestoneAction, createNeedAction, createTestTypeAction, removeMilestoneAction, setReportRefAction, setTestTypeActiveAction, updateMilestoneAction, updateNeedAction,
  withdrawNeedAction,
} from './actions';

export interface MilestoneRef {
  id: string;
  projectCode: string;
  label: string;
  dueOn: string;
  criticality: MilestoneCriticality;
}

export function MilestoneForm({ projectCode, milestone }: { projectCode: string; milestone?: MilestoneRef }) {
  const { t } = useI18n();
  const key = milestone?.id ?? projectCode;
  return (
    <ActionForm action={milestone ? updateMilestoneAction : addMilestoneAction} submit={milestone ? 'Save the milestone' : 'Add the milestone'} done={milestone ? 'Milestone saved' : 'Milestone added'}>
      <input type="hidden" name="projectCode" value={projectCode} />
      {milestone && <input type="hidden" name="milestoneId" value={milestone.id} />}
      <Field label={t('Milestone')} htmlFor={`ms-label-${key}`} required>
        <Input id={`ms-label-${key}`} name="label" required defaultValue={milestone?.label} />
      </Field>
      <Field label={t('Date')} htmlFor={`ms-due-${key}`} required>
        <Input id={`ms-due-${key}`} name="dueOn" type="date" required defaultValue={milestone?.dueOn} />
      </Field>
      <Field label={t('Criticality')} htmlFor={`ms-crit-${key}`}>
        <Select id={`ms-crit-${key}`} name="criticality" defaultValue={milestone?.criticality ?? 'internal'} options={MILESTONE_CRITICALITIES.map((c) => ({ value: c, label: t(MILESTONE_CRITICALITY_LABEL[c]) }))} />
      </Field>
    </ActionForm>
  );
}

export function EditMilestone({ milestone }: { milestone: MilestoneRef }) {
  return (
    <Folded summary="Change" size="xs" variant="ghost">
      <MilestoneForm projectCode={milestone.projectCode} milestone={milestone} />
      <ActionButton run={() => removeMilestoneAction(milestone.id)} label="Remove the milestone" done="Milestone removed" variant="ghost" />
    </Folded>
  );
}

export interface ResourceRef {
  id: string;
  code: string;
  name: string;
}

export interface TestTypeRef {
  code: string;
  name: string;
  nominalResourceId: string | null;
  typicalHalfDays: number;
}

export interface NeedValues {
  id: string;
  projectCode: string;
  level: NeedLevel;
  title: string;
  resourceId: string;
  halfDays: number;
  earliestOn: string;
  deadlineOn: string;
  milestoneId: string | null;
  testTypeCode: string | null;
  codexRef: string | null;
  note: string | null;
}

/**
 * A need (spec 03 §6): a forecast or a request, on a resource, its length in half-days, from its earliest date to its
 * deadline — or to the milestone it serves. Choosing a test type proposes its nominal resource and usual length.
 */
export function NeedForm({ projects, milestones, resources, testTypes, today, need: editing, draft }: {
  projects: { code: string; name: string }[]; milestones: MilestoneRef[]; resources: ResourceRef[]; testTypes: TestTypeRef[]; today: string; need?: NeedValues;
  /** A need prepared by the assistant (delivery 6): the form starts from it; recording it cites the exchange in the journal. */
  draft?: Omit<NeedValues, 'id' | 'codexRef'> & { turnId: string };
}) {
  const { t } = useI18n();
  const need: (Omit<NeedValues, 'id'> & { id?: string }) | undefined = editing ?? (draft ? { ...draft, codexRef: null, id: undefined } : undefined);
  const key = editing?.id ?? 'new';
  const [projectCode, setProjectCode] = useState(need?.projectCode ?? projects[0]?.code ?? '');
  const [resourceId, setResourceId] = useState(need?.resourceId ?? resources[0]?.id ?? '');
  const [halfDays, setHalfDays] = useState(String(need?.halfDays ?? 2));
  const [typeCode, setTypeCode] = useState(need?.testTypeCode ?? '');
  const mine = milestones.filter((m) => m.projectCode === projectCode);
  const pickType = (code: string) => {
    setTypeCode(code);
    const x = testTypes.find((y) => y.code === code);
    if (!x) return;
    if (x.nominalResourceId && resources.some((r) => r.id === x.nominalResourceId)) setResourceId(x.nominalResourceId);
    setHalfDays(String(x.typicalHalfDays));
  };
  return (
    <ActionForm action={editing ? updateNeedAction : createNeedAction} submit={editing ? 'Save the need' : 'Record the need'} done={editing ? 'Need saved' : 'Need recorded'}>
      {editing && <input type="hidden" name="needId" value={editing.id} />}
      {draft && <input type="hidden" name="assistantTurn" value={draft.turnId} />}
      {editing || projects.length === 1 ? (
        <input type="hidden" name="projectCode" value={projectCode} />
      ) : (
        <Field label={t('Project')} htmlFor={`nd-proj-${key}`} required>
          <Select id={`nd-proj-${key}`} name="projectCode" value={projectCode} onChange={(e) => setProjectCode(e.target.value)} options={projects.map((p) => ({ value: p.code, label: `${p.code} · ${p.name}` }))} />
        </Field>
      )}
      <Field label={t('Level')} htmlFor={`nd-level-${key}`} required hint={t('Forecast: an envelope to anticipate. Request: a detailed test to plan.')}>
        <Select id={`nd-level-${key}`} name="level" defaultValue={need?.level ?? 'forecast'} options={NEED_LEVELS.map((l) => ({ value: l, label: t(NEED_LEVEL_LABEL[l]) }))} />
      </Field>
      <Field label={t('Tests needed')} htmlFor={`nd-title-${key}`} required>
        <Input id={`nd-title-${key}`} name="title" required defaultValue={need?.title} />
      </Field>
      <Field label={t('Test type')} htmlFor={`nd-type-${key}`}>
        <Select id={`nd-type-${key}`} name="testTypeCode" value={typeCode} onChange={(e) => pickType(e.target.value)} options={[{ value: '', label: '—' }, ...testTypes.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }))]} />
      </Field>
      <Field label={t('Resource')} htmlFor={`nd-res-${key}`} required>
        <Select id={`nd-res-${key}`} name="resourceId" value={resourceId} onChange={(e) => setResourceId(e.target.value)} options={resources.map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` }))} />
      </Field>
      <Field label={t('Half-days')} htmlFor={`nd-hd-${key}`} required>
        <Input id={`nd-hd-${key}`} name="halfDays" type="number" min={1} max={400} required value={halfDays} onChange={(e) => setHalfDays(e.target.value)} />
      </Field>
      <Field label={t('Milestone served')} htmlFor={`nd-ms-${key}`}>
        <Select id={`nd-ms-${key}`} name="milestoneId" defaultValue={need?.milestoneId ?? ''} options={[{ value: '', label: '—' }, ...mine.map((m) => ({ value: m.id, label: `${m.label} · ${m.dueOn}` }))]} />
      </Field>
      <Field label={t('Earliest date')} htmlFor={`nd-from-${key}`}>
        <Input id={`nd-from-${key}`} name="earliestOn" type="date" min={today} defaultValue={need?.earliestOn} />
      </Field>
      <Field label={t('Deadline')} htmlFor={`nd-to-${key}`} hint={t('Empty: the date of the milestone served.')}>
        <Input id={`nd-to-${key}`} name="deadlineOn" type="date" min={today} defaultValue={need?.deadlineOn} />
      </Field>
      <Field label={t('Codex reference of the protocol')} htmlFor={`nd-codex-${key}`}>
        <Input id={`nd-codex-${key}`} name="codexRef" defaultValue={need?.codexRef ?? ''} />
      </Field>
      <Field label={t('Note')} htmlFor={`nd-note-${key}`}>
        <Textarea id={`nd-note-${key}`} name="note" short defaultValue={need?.note ?? ''} />
      </Field>
    </ActionForm>
  );
}

export function EditNeed(props: Parameters<typeof NeedForm>[0] & { need: NeedValues }) {
  const { t } = useI18n();
  return (
    <Folded summary="Change" size="xs" variant="ghost">
      <NeedForm {...props} />
      <ActionForm action={withdrawNeedAction} submit="Withdraw the need" done="Need withdrawn" inline variant="ghost">
        <input type="hidden" name="needId" value={props.need.id} />
        <Input size="inline" name="reason" placeholder={t('Reason')} aria-label={t('Reason')} required />
      </ActionForm>
    </Folded>
  );
}

export function TestTypeForm({ resources }: { resources: ResourceRef[] }) {
  const { t } = useI18n();
  return (
    <ActionForm action={createTestTypeAction} submit="Add the test type" done="Test type added">
      <Field label={t('Code')} htmlFor="tt-code" required>
        <Input id="tt-code" name="code" required maxLength={24} />
      </Field>
      <Field label={t('Name')} htmlFor="tt-name" required>
        <Input id="tt-name" name="name" required />
      </Field>
      <Field label={t('Nominal resource')} htmlFor="tt-res">
        <Select id="tt-res" name="nominalResourceId" options={[{ value: '', label: '—' }, ...resources.map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` }))]} />
      </Field>
      <Field label={t('Usual length (half-days)')} htmlFor="tt-hd">
        <Input id="tt-hd" name="typicalHalfDays" type="number" min={1} max={400} defaultValue={2} />
      </Field>
      <Field label={t('Skills required')} htmlFor="tt-skills">
        <Input id="tt-skills" name="skills" />
      </Field>
    </ActionForm>
  );
}

export function TestTypeActiveButton({ code, active }: { code: string; active: boolean }) {
  return active
    ? <ActionButton run={() => setTestTypeActiveAction(code, false)} label="Withdraw" done="Withdrawn from the catalogue" variant="ghost" />
    : <ActionButton run={() => setTestTypeActiveAction(code, true)} label="Restore" done="Restored" variant="ghost" />;
}

export function ReportRefForm({ bookingId, codexRef }: { bookingId: string; codexRef: string | null }) {
  const { t } = useI18n();
  return (
    <ActionForm action={setReportRefAction} submit="Save" done="Saved" inline variant="ghost">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Input size="inline" name="codexRef" defaultValue={codexRef ?? ''} placeholder={t('Codex reference of the report')} aria-label={t('Codex reference of the report')} required />
    </ActionForm>
  );
}
