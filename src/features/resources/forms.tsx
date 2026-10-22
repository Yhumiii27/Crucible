'use client';
// Forms and buttons of delivery 2 (client islands of the server pages): each submits to its Server Function and shows the
// translated result and warnings. The Server Functions do every check again; these only collect the input.
import { useActionState, useState, useTransition } from 'react';
import { ActionForm, Result, type ActionResult } from '@/components/app/ActionForm';
import { Button } from '@/components/ds/Button';
import { Field, Input, Select, Textarea } from '@/components/ds/Field';
import { RESOURCE_KINDS, RESOURCE_KIND_LABEL, RESOURCE_STATUSES, RESOURCE_STATUS_LABEL, RULE_REASONS, RULE_REASON_LABEL, UNAVAILABILITY_KINDS, UNAVAILABILITY_KIND_LABEL, GRANULARITIES, GRANULARITY_LABEL } from '@/domain/resources';
import { useI18n } from '@/i18n/client';
import {
  addClosureAction, addUnavailabilityAction, cancelBookingAction, confirmBookingAction, createResourceAction, finishBookingAction, importHistoryAction,
  markNoShowAction, proposeRuleAction, recordInspectionAction, removeUnavailabilityAction, requestBookingAction, retireRuleAction, setAgreementAction,
  setFacilityHoursAction, setResourceStatusAction, startBookingAction, validateRuleAction,
} from './actions';
import s from './forms.module.css';

export interface Ref {
  code: string;
  name: string;
}

/** A button running a Server Function on one object, with its result next to it. */
function RunButton({ run, label, done, variant = 'secondary' }: { run: () => Promise<ActionResult>; label: string; done: string; variant?: 'primary' | 'secondary' | 'ghost' }) {
  const { t } = useI18n();
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className={s.inline}>
      <Button size="xs" variant={variant} disabled={pending} onClick={() => start(async () => setState(await run()))}>
        {t(label)}
      </Button>
      <Result state={state} done={done} />
    </span>
  );
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function NewResourceForm({ facilityCode }: { facilityCode: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={createResourceAction} submit="Add the resource" done="Resource added">
      <input type="hidden" name="facilityCode" value={facilityCode} />
      <Field label={t('Code')} htmlFor="nr-code" required>
        <Input id="nr-code" name="code" required maxLength={24} />
      </Field>
      <Field label={t('Name')} htmlFor="nr-name" required>
        <Input id="nr-name" name="name" required />
      </Field>
      <Field label={t('Kind')} htmlFor="nr-kind" required>
        <Select id="nr-kind" name="kind" options={RESOURCE_KINDS.map((k) => ({ value: k, label: t(RESOURCE_KIND_LABEL[k]) }))} />
      </Field>
      <Field label={t('Booked by')} htmlFor="nr-gran">
        <Select id="nr-gran" name="granularity" options={GRANULARITIES.map((g) => ({ value: g, label: t(GRANULARITY_LABEL[g]) }))} />
      </Field>
      <Field label={t('Capacity')} htmlFor="nr-cap">
        <Input id="nr-cap" name="capacity" type="number" min={1} max={20} defaultValue={1} />
      </Field>
      <Field label={t('Preparation (min)')} htmlFor="nr-setup">
        <Input id="nr-setup" name="setupMinutes" type="number" min={0} max={1440} defaultValue={0} />
      </Field>
      <Field label={t('Restoring (min)')} htmlFor="nr-down">
        <Input id="nr-down" name="teardownMinutes" type="number" min={0} max={1440} defaultValue={0} />
      </Field>
    </ActionForm>
  );
}

export function ResourceStatusSelect({ resourceId, status }: { resourceId: string; status: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className={s.inline}>
      <Select size="inline" aria-label={t('Status')} defaultValue={status} disabled={pending}
        options={RESOURCE_STATUSES.map((x) => ({ value: x, label: t(RESOURCE_STATUS_LABEL[x]) }))}
        onChange={(e) => { const v = e.target.value; start(async () => setState(await setResourceStatusAction(resourceId, v))); }} />
      <Result state={state} done="Saved" />
    </span>
  );
}

export function HoursForm({ facilityCode, hours }: { facilityCode: string; hours: { weekday: number; opensAt: string; closesAt: string }[] }) {
  const { t } = useI18n();
  return (
    <details className={s.fold}>
      <summary>{t('Change the opening hours')}</summary>
      <ActionForm action={setFacilityHoursAction} submit="Save the opening hours" done="Opening hours saved">
        <input type="hidden" name="facilityCode" value={facilityCode} />
        <div className={s.hours}>
          {WEEKDAYS.map((d, i) => {
            const h = hours.find((x) => x.weekday === i + 1);
            return (
              <label key={d} className={s.day}>
                <span>{t(d)}</span>
                <Input name={`opens${i + 1}`} type="time" defaultValue={h?.opensAt ?? ''} aria-label={`${t(d)} · ${t('opens')}`} />
                <Input name={`closes${i + 1}`} type="time" defaultValue={h?.closesAt ?? ''} aria-label={`${t(d)} · ${t('closes')}`} />
              </label>
            );
          })}
        </div>
      </ActionForm>
    </details>
  );
}

export function ClosureForm({ facilityCode }: { facilityCode: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={addClosureAction} submit="Add the closure" done="Closure added">
      <input type="hidden" name="facilityCode" value={facilityCode} />
      <Field label={t('From')} htmlFor="cl-from" required>
        <Input id="cl-from" name="fromOn" type="date" required />
      </Field>
      <Field label={t('To')} htmlFor="cl-to">
        <Input id="cl-to" name="toOn" type="date" />
      </Field>
      <Field label={t('Reason')} htmlFor="cl-label" required>
        <Input id="cl-label" name="label" required />
      </Field>
    </ActionForm>
  );
}

export function UnavailabilityForm({ resources }: { resources: { id: string; code: string }[] }) {
  const { t } = useI18n();
  return (
    <ActionForm action={addUnavailabilityAction} submit="Declare the unavailability" done="Unavailability declared">
      <Field label={t('Resource')} htmlFor="un-res" required>
        <Select id="un-res" name="resourceId" options={resources.map((r) => ({ value: r.id, label: r.code }))} />
      </Field>
      <Field label={t('Kind')} htmlFor="un-kind" required>
        <Select id="un-kind" name="kind" options={UNAVAILABILITY_KINDS.map((k) => ({ value: k, label: t(UNAVAILABILITY_KIND_LABEL[k]) }))} />
      </Field>
      <Field label={t('Description')} htmlFor="un-label" required>
        <Input id="un-label" name="label" required />
      </Field>
      <Field label={t('From')} htmlFor="un-from" required>
        <Input id="un-from" name="fromOn" type="date" required />
      </Field>
      <Field label={t('To')} htmlFor="un-to">
        <Input id="un-to" name="toOn" type="date" />
      </Field>
    </ActionForm>
  );
}

export function RemoveUnavailabilityButton({ id }: { id: string }) {
  return <RunButton run={() => removeUnavailabilityAction(id)} label="Remove" done="Removed" variant="ghost" />;
}

export function InspectionForm({ resources, today }: { resources: { id: string; code: string }[]; today: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={recordInspectionAction} submit="Record the inspection" done="Inspection recorded">
      <Field label={t('Resource')} htmlFor="in-res" required>
        <Select id="in-res" name="resourceId" options={resources.map((r) => ({ value: r.id, label: r.code }))} />
      </Field>
      <Field label={t('Inspection')} htmlFor="in-label" required>
        <Input id="in-label" name="label" required />
      </Field>
      <Field label={t('Every (months)')} htmlFor="in-period" required>
        <Input id="in-period" name="periodMonths" type="number" min={1} max={120} defaultValue={12} required />
      </Field>
      <Field label={t('Last inspection')} htmlFor="in-last" required>
        <Input id="in-last" name="lastOn" type="date" max={today} required />
      </Field>
      <Field label={t('Codex reference')} htmlFor="in-codex">
        <Input id="in-codex" name="codexRef" />
      </Field>
    </ActionForm>
  );
}

export function ProposeRuleForm({ resources }: { resources: { id: string; code: string }[] }) {
  const { t } = useI18n();
  return (
    <ActionForm action={proposeRuleAction} submit="Propose the rule" done="Rule proposed: awaiting the safety officer">
      <Field label={t('Code')} htmlFor="ru-code" required>
        <Input id="ru-code" name="code" required maxLength={24} />
      </Field>
      <Field label={t('Name')} htmlFor="ru-label" required>
        <Input id="ru-label" name="label" required />
      </Field>
      <Field label={t('Resources')} htmlFor="ru-res" required>
        <Select id="ru-res" name="resourceIds" multiple options={resources.map((r) => ({ value: r.id, label: r.code }))} />
      </Field>
      <Field label={t('At most active at once')} htmlFor="ru-max" required>
        <Input id="ru-max" name="maxActive" type="number" min={1} defaultValue={1} required />
      </Field>
      <Field label={t('Reason')} htmlFor="ru-reason" required>
        <Select id="ru-reason" name="reason" options={RULE_REASONS.map((r) => ({ value: r, label: t(RULE_REASON_LABEL[r]) }))} />
      </Field>
      <Field label={t('Why')} htmlFor="ru-motive" required>
        <Textarea id="ru-motive" name="motive" required short />
      </Field>
      <Field label={t('Codex reference of the risk analysis')} htmlFor="ru-codex">
        <Input id="ru-codex" name="codexRef" />
      </Field>
    </ActionForm>
  );
}

export function ValidateRuleButton({ id }: { id: string }) {
  return <RunButton run={() => validateRuleAction(id)} label="Validate" done="Rule validated" variant="primary" />;
}

export function RetireRuleForm({ id }: { id: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={retireRuleAction} submit="Retire the rule" done="Rule retired" inline variant="ghost">
      <input type="hidden" name="ruleId" value={id} />
      <Input size="inline" name="reason" placeholder={t('Reason')} aria-label={t('Reason')} required />
    </ActionForm>
  );
}

export function AgreementForm({ pairs }: { pairs: { facilityCode: string; entityCode: string }[] }) {
  const { t } = useI18n();
  const [pair, setPair] = useState(pairs[0] ? `${pairs[0].facilityCode}|${pairs[0].entityCode}` : '');
  const [facilityCode, entityCode] = pair.split('|');
  return (
    <ActionForm action={setAgreementAction} submit="Save the agreement" done="Agreement saved">
      <Field label={t('Facility and partner')} htmlFor="ag-pair" required>
        <Select id="ag-pair" value={pair} onChange={(e) => setPair(e.target.value)} options={pairs.map((p) => ({ value: `${p.facilityCode}|${p.entityCode}`, label: `${p.facilityCode} · ${p.entityCode}` }))} />
      </Field>
      <input type="hidden" name="facilityCode" value={facilityCode ?? ''} />
      <input type="hidden" name="entityCode" value={entityCode ?? ''} />
      <Field label={t('Quota (days per month)')} htmlFor="ag-quota">
        <Input id="ag-quota" name="quotaDaysPerMonth" type="number" min={0} max={31} />
      </Field>
      <Field label={t('Notice (working days)')} htmlFor="ag-notice">
        <Input id="ag-notice" name="noticeWorkdays" type="number" min={0} max={60} defaultValue={10} />
      </Field>
      <Field label={t('Note')} htmlFor="ag-note">
        <Input id="ag-note" name="note" />
      </Field>
    </ActionForm>
  );
}

export interface BookableResource {
  id: string;
  code: string;
  name: string;
  granularity: 'half_day' | 'hour';
}

/** Request for a slot: half-days or times depending on the resource (F-1). */
export function RequestBookingForm({ resources, projects, today, needs = [] }: { resources: BookableResource[]; projects: Ref[]; today: string; needs?: { id: string; ref: string; projectCode: string; title: string }[] }) {
  const { t } = useI18n();
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? '');
  const [projectCode, setProjectCode] = useState(projects[0]?.code ?? '');
  const served = needs.filter((n) => n.projectCode === projectCode);
  const hour = resources.find((r) => r.id === resourceId)?.granularity === 'hour';
  const halves = [{ value: 'am', label: t('Morning') }, { value: 'pm', label: t('Afternoon') }];
  return (
    <ActionForm action={requestBookingAction} submit="Request the slot" done="Slot requested">
      <Field label={t('Resource')} htmlFor="rq-res" required>
        <Select id="rq-res" name="resourceId" value={resourceId} onChange={(e) => setResourceId(e.target.value)} options={resources.map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` }))} />
      </Field>
      <Field label={t('Project')} htmlFor="rq-proj" required>
        <Select id="rq-proj" name="projectCode" value={projectCode} onChange={(e) => setProjectCode(e.target.value)} options={projects.map((p) => ({ value: p.code, label: `${p.code} · ${p.name}` }))} />
      </Field>
      {served.length > 0 && (
        <Field label={t('Need served')} htmlFor="rq-need">
          <Select id="rq-need" name="needId" options={[{ value: '', label: '—' }, ...served.map((n) => ({ value: n.id, label: `${n.ref} · ${n.title}` }))]} />
        </Field>
      )}
      <Field label={t('Purpose of the test')} htmlFor="rq-title" required>
        <Input id="rq-title" name="title" required />
      </Field>
      <Field label={t('First day')} htmlFor="rq-from" required>
        <Input id="rq-from" name="fromOn" type="date" min={today} required />
      </Field>
      {hour ? (
        <Field label={t('Start time')} htmlFor="rq-ft" required>
          <Input id="rq-ft" name="fromTime" type="time" required />
        </Field>
      ) : (
        <Field label={t('Starting')} htmlFor="rq-fh">
          <Select id="rq-fh" name="fromHalf" options={halves} />
        </Field>
      )}
      <Field label={t('Last day')} htmlFor="rq-to">
        <Input id="rq-to" name="toOn" type="date" min={today} />
      </Field>
      {hour ? (
        <Field label={t('End time')} htmlFor="rq-tt" required>
          <Input id="rq-tt" name="toTime" type="time" required />
        </Field>
      ) : (
        <Field label={t('Ending')} htmlFor="rq-th">
          <Select id="rq-th" name="toHalf" defaultValue="pm" options={halves} />
        </Field>
      )}
      <Field label={t('Operators')} htmlFor="rq-ops">
        <Input id="rq-ops" name="operators" />
      </Field>
    </ActionForm>
  );
}

export function ConfirmBookingButton({ id }: { id: string }) {
  return <RunButton run={() => confirmBookingAction(id)} label="Confirm" done="Confirmed" variant="primary" />;
}

export function StartBookingButton({ id }: { id: string }) {
  return <RunButton run={() => startBookingAction(id)} label="Start" done="Started" variant="primary" />;
}

export function NoShowButton({ id }: { id: string }) {
  return <RunButton run={() => markNoShowAction(id)} label="Release (not held)" done="Released" variant="ghost" />;
}

export function CancelBookingForm({ id }: { id: string }) {
  const { t } = useI18n();
  return (
    <details className={s.fold}>
      <summary>{t('Cancel')}</summary>
      <ActionForm action={cancelBookingAction} submit="Cancel the booking" done="Booking cancelled" inline variant="ghost">
        <input type="hidden" name="bookingId" value={id} />
        <Input size="inline" name="reason" placeholder={t('Reason')} aria-label={t('Reason')} required />
      </ActionForm>
    </details>
  );
}

/** Ends a test now, or at the times typed (caught up at the end of the day, X-1). */
export function FinishBookingForm({ id }: { id: string }) {
  const { t } = useI18n();
  const [state, run, pending] = useActionState(finishBookingAction, null);
  return (
    <form action={run} className={s.inline}>
      <input type="hidden" name="bookingId" value={id} />
      <Input size="inline" name="actualFrom" type="time" aria-label={t('Actual start')} title={t('Actual start')} />
      <Input size="inline" name="actualTo" type="time" aria-label={t('Actual end')} title={t('Actual end')} />
      <Button type="submit" size="xs" variant="primary" disabled={pending}>
        {t('End the test')}
      </Button>
      <Result state={state} done="Test ended" />
    </form>
  );
}

export function ImportHistoryForm() {
  const { t } = useI18n();
  return (
    <ActionForm action={importHistoryAction} submit="Import" done="Imported">
      <Field label={t('Past bookings, one per line')} htmlFor="ih-csv" span="full" hint={t('resource ; project ; start ; end ; actual start ; actual end ; purpose — dates YYYY-MM-DD HH:MM; "absent" = not held')}>
        <Textarea id="ih-csv" name="csv" required />
      </Field>
    </ActionForm>
  );
}
