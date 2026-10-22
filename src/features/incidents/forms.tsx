'use client';
// Forms of delivery 5 (client islands of the server pages): declare an incident, run a what-if simulation, declare an urgency,
// decide a scenario, close an incident, mark the bell read. The Server Functions do every check again.
import { useState } from 'react';
import { ActionButton, ActionForm } from '@/components/app/ActionForm';
import { Field, Input, Select } from '@/components/ds/Field';
import { useI18n } from '@/i18n/client';
import { closeIncidentAction, decideScenarioAction, declareIncidentAction, declareUrgencyAction, markNotificationsReadAction, simulateAction } from './actions';

export interface Opt {
  value: string;
  label: string;
}

export function IncidentForm({ resources, people, today }: { resources: Opt[]; people: Opt[]; today: string }) {
  const { t } = useI18n();
  const [kind, setKind] = useState(resources.length ? 'breakdown' : 'absence');
  return (
    <ActionForm action={declareIncidentAction} submit="Declare the incident" done="Incident declared">
      <Field label={t('Kind')} htmlFor="in-kind" required>
        <Select id="in-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}
          options={[...(resources.length ? [{ value: 'breakdown', label: t('Breakdown') }] : []), ...(people.length ? [{ value: 'absence', label: t('Absence') }] : [])]} />
      </Field>
      {kind === 'breakdown' ? (
        <Field label={t('Resource')} htmlFor="in-res" required><Select id="in-res" name="resourceId" options={resources} /></Field>
      ) : (
        <Field label={t('Person')} htmlFor="in-person" required><Select id="in-person" name="personId" options={people} /></Field>
      )}
      <Field label={t('From')} htmlFor="in-from" required><Input id="in-from" name="fromOn" type="date" defaultValue={today} required /></Field>
      <Field label={t('To (expected)')} htmlFor="in-to"><Input id="in-to" name="toOn" type="date" /></Field>
      <Field label={t('Description')} htmlFor="in-label" required><Input id="in-label" name="label" required /></Field>
    </ActionForm>
  );
}

export function SimulationForm({ resources }: { resources: Opt[] }) {
  const { t } = useI18n();
  return (
    <ActionForm action={simulateAction} submit="Simulate" done="Simulation computed">
      <Field label={t('Resource out of service')} htmlFor="si-res" required><Select id="si-res" name="resourceId" options={resources} /></Field>
      <Field label={t('From')} htmlFor="si-from" required><Input id="si-from" name="fromOn" type="date" required /></Field>
      <Field label={t('To')} htmlFor="si-to"><Input id="si-to" name="toOn" type="date" /></Field>
    </ActionForm>
  );
}

export function UrgencyForm({ needs }: { needs: Opt[] }) {
  const { t } = useI18n();
  return (
    <ActionForm action={declareUrgencyAction} submit="Declare the urgency" done="Urgency declared: scenario to decide">
      <Field label={t('Need')} htmlFor="ur-need" required><Select id="ur-need" name="needId" options={needs} /></Field>
      <Field label={t('Reason')} htmlFor="ur-reason" required hint={t('Customer claim, incident…')}><Input id="ur-reason" name="reason" required /></Field>
    </ActionForm>
  );
}

export function DecideScenarioForm({ scenarioId }: { scenarioId: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={decideScenarioAction} submit="Decide" done="Decision recorded">
      <input type="hidden" name="scenarioId" value={scenarioId} />
      <Field label={t('Decision')} htmlFor={`sd-${scenarioId}`} required>
        <Select id={`sd-${scenarioId}`} name="decision" options={[{ value: 'accept', label: t('Accept: move the bookings') }, { value: 'reject', label: t('Reject') }]} />
      </Field>
      <Field label={t('Reason')} htmlFor={`sr-${scenarioId}`} required><Input id={`sr-${scenarioId}`} name="reason" required /></Field>
    </ActionForm>
  );
}

export function CloseIncidentButton({ id }: { id: string }) {
  return <ActionButton run={() => closeIncidentAction(id)} label="Close" done="Closed" variant="ghost" />;
}

export function MarkReadButton() {
  return <ActionButton run={markNotificationsReadAction} label="Mark all as read" done="Marked as read" variant="ghost" />;
}
