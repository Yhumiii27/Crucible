'use client';
// Forms of the chargeback rates (CR-074): a dated rate for a resource, for every entity or one; withdraw a rate entered by mistake.
import { ActionButton, ActionForm } from '@/components/app/ActionForm';
import { Field, Input, Select } from '@/components/ds/Field';
import { useI18n } from '@/i18n/client';
import { addRateAction, withdrawRateAction } from './actions';

interface Opt {
  value: string;
  label: string;
}

export function RateForm({ resources, entities, today }: { resources: Opt[]; entities: string[]; today: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={addRateAction} submit="Add the rate" done="Rate added">
      <Field label={t('Resource')} htmlFor="rate-res" required><Select id="rate-res" name="resourceId" options={resources} required /></Field>
      <Field label={t('Entity')} htmlFor="rate-ent" hint={t('Every entity, unless one has its own rate.')}>
        <Select id="rate-ent" name="entityCode" options={[{ value: '', label: t('Every entity') }, ...entities.map((e) => ({ value: e, label: e }))]} />
      </Field>
      <Field label={t('Rate (€ per hour)')} htmlFor="rate-eur" required><Input id="rate-eur" name="eurPerHour" inputMode="decimal" required maxLength={10} placeholder="85,00" /></Field>
      <Field label={t('From')} htmlFor="rate-from" required hint={t('A newer rate takes over from its first day; the older ones stay for the past months.')}>
        <Input id="rate-from" name="validFrom" type="date" required defaultValue={today} />
      </Field>
    </ActionForm>
  );
}

export function WithdrawRateButton({ id }: { id: string }) {
  return <ActionButton run={() => withdrawRateAction(id)} label="Withdraw" done="Withdrawn" variant="ghost" />;
}
