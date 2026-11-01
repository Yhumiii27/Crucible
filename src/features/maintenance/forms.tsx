'use client';
// Maintenance and calibration forms (CR-073): a plan for a resource, an intervention done, a plan withdrawn. The Server
// Functions do every check again.
import { ActionButton, ActionForm } from '@/components/app/ActionForm';
import { Field, Input, Select } from '@/components/ds/Field';
import { MAINTENANCE_KINDS, MAINTENANCE_KIND_LABEL } from '@/domain/maintenance';
import { useI18n } from '@/i18n/client';
import { createMaintenancePlanAction, recordMaintenanceAction, withdrawMaintenancePlanAction } from './actions';

export function MaintenancePlanForm({ resources, today }: { resources: { id: string; code: string }[]; today: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={createMaintenancePlanAction} submit="Add the plan" done="Plan added">
      <Field label={t('Resource')} htmlFor="mp-res" required>
        <Select id="mp-res" name="resourceId" options={resources.map((r) => ({ value: r.id, label: r.code }))} />
      </Field>
      <Field label={t('Kind')} htmlFor="mp-kind" required>
        <Select id="mp-kind" name="kind" options={MAINTENANCE_KINDS.map((k) => ({ value: k, label: t(MAINTENANCE_KIND_LABEL[k]) }))} />
      </Field>
      <Field label={t('Intervention')} htmlFor="mp-label" required>
        <Input id="mp-label" name="label" required />
      </Field>
      <Field label={t('Every (months)')} htmlFor="mp-period" required>
        <Input id="mp-period" name="periodMonths" type="number" min={1} max={120} defaultValue={12} required />
      </Field>
      <Field label={t('Last intervention')} htmlFor="mp-last" required>
        <Input id="mp-last" name="lastOn" type="date" max={today} required />
      </Field>
      <Field label={t('Provider')} htmlFor="mp-prov">
        <Input id="mp-prov" name="provider" />
      </Field>
      <Field label={t('Blocks the bookings once overdue')} htmlFor="mp-block" hint={t('Otherwise the managers are only alerted.')}>
        <input id="mp-block" type="checkbox" name="blocking" defaultChecked />
      </Field>
    </ActionForm>
  );
}

export function MaintenanceRecordForm({ planId, today }: { planId: string; today: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={recordMaintenanceAction} submit="Record the intervention" done="Intervention recorded">
      <input type="hidden" name="planId" value={planId} />
      <Field label={t('Done on')} htmlFor={`mr-on-${planId}`} required>
        <Input id={`mr-on-${planId}`} name="doneOn" type="date" max={today} defaultValue={today} required />
      </Field>
      <Field label={t('Provider')} htmlFor={`mr-prov-${planId}`}>
        <Input id={`mr-prov-${planId}`} name="provider" />
      </Field>
      <Field label={t('Codex reference of the certificate or report')} htmlFor={`mr-codex-${planId}`}>
        <Input id={`mr-codex-${planId}`} name="codexRef" />
      </Field>
      <Field label={t('Note')} htmlFor={`mr-note-${planId}`}>
        <Input id={`mr-note-${planId}`} name="note" />
      </Field>
    </ActionForm>
  );
}

export function WithdrawPlanButton({ planId }: { planId: string }) {
  return <ActionButton run={() => withdrawMaintenancePlanAction(planId)} label="Withdraw" done="Withdrawn" variant="ghost" />;
}
