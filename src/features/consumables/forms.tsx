'use client';
// Forms of the consumables (CR-076): declare or change a consumable, receive a lot, correct the stock, set what a test type needs.
// The Server Functions check everything again.
import { ActionForm, Folded } from '@/components/app/ActionForm';
import { Field, Input, Select } from '@/components/ds/Field';
import { useI18n } from '@/i18n/client';
import { correctStockAction, receiveLotAction, saveConsumableAction, setRequirementAction } from './actions';

interface Opt {
  value: string;
  label: string;
}

export function ConsumableForm({ facilityCode, current }: { facilityCode: string; current?: { id: string; name: string; unit: string; threshold: number | null; active: boolean } }) {
  const { t } = useI18n();
  const id = current ? `cs-${current.id}` : 'cs-new';
  return (
    <ActionForm action={saveConsumableAction} submit={current ? 'Save' : 'Add the consumable'} done={current ? 'Saved' : 'Consumable added'}>
      <input type="hidden" name="facilityCode" value={facilityCode} />
      {current && <input type="hidden" name="id" value={current.id} />}
      <Field label={t('Name')} htmlFor={`${id}-n`} required><Input id={`${id}-n`} name="name" required maxLength={120} defaultValue={current?.name} /></Field>
      <Field label={t('Unit')} htmlFor={`${id}-u`} required hint={t('e.g. L, kg, piece')}><Input id={`${id}-u`} name="unit" required maxLength={20} defaultValue={current?.unit} /></Field>
      <Field label={t('Alert threshold')} htmlFor={`${id}-t`} hint={t('The managers are warned when the stock is at or under it.')}>
        <Input id={`${id}-t`} name="threshold" inputMode="decimal" maxLength={12} defaultValue={current?.threshold ?? ''} />
      </Field>
      {current && (
        <Field label={t('In use')} htmlFor={`${id}-a`}><input id={`${id}-a`} type="checkbox" name="active" defaultChecked={current.active} /></Field>
      )}
    </ActionForm>
  );
}

export function ReceiveLotForm({ consumableId, today }: { consumableId: string; today: string }) {
  const { t } = useI18n();
  const id = `lot-${consumableId}`;
  return (
    <Folded summary="Receive a lot" size="xs">
      <ActionForm action={receiveLotAction} submit="Record the receipt" done="Lot received">
        <input type="hidden" name="consumableId" value={consumableId} />
        <Field label={t('Lot reference')} htmlFor={`${id}-r`} required><Input id={`${id}-r`} name="lotRef" required maxLength={60} /></Field>
        <Field label={t('Quantity')} htmlFor={`${id}-q`} required><Input id={`${id}-q`} name="quantity" inputMode="decimal" required maxLength={12} /></Field>
        <Field label={t('Expires on')} htmlFor={`${id}-e`} hint={t('Empty when it does not expire.')}><Input id={`${id}-e`} name="expiresOn" type="date" min={today} /></Field>
      </ActionForm>
    </Folded>
  );
}

export function CorrectStockForm({ consumableId, lots }: { consumableId: string; lots: Opt[] }) {
  const { t } = useI18n();
  const id = `cor-${consumableId}`;
  return (
    <Folded summary="Correct the stock" size="xs" variant="ghost">
      <ActionForm action={correctStockAction} submit="Record" done="Stock corrected">
        <input type="hidden" name="consumableId" value={consumableId} />
        <Field label={t('What')} htmlFor={`${id}-k`} required>
          <Select id={`${id}-k`} name="kind" options={[{ value: 'adjust', label: t('Count adjustment') }, { value: 'discard', label: t('Discarded') }]} />
        </Field>
        <Field label={t('Lot')} htmlFor={`${id}-l`}><Select id={`${id}-l`} name="lotId" options={[{ value: '', label: '—' }, ...lots]} /></Field>
        <Field label={t('Quantity')} htmlFor={`${id}-q`} required hint={t('An adjustment is signed: +2 or -1.5; a discard is taken out.')}>
          <Input id={`${id}-q`} name="quantity" inputMode="decimal" required maxLength={13} />
        </Field>
        <Field label={t('Reason')} htmlFor={`${id}-w`} required><Input id={`${id}-w`} name="reason" required maxLength={500} /></Field>
      </ActionForm>
    </Folded>
  );
}

export function RequirementForm({ consumables, testTypes }: { consumables: Opt[]; testTypes: Opt[] }) {
  const { t } = useI18n();
  return (
    <ActionForm action={setRequirementAction} submit="Save" done="Saved">
      <Field label={t('Test type')} htmlFor="req-tt" required><Select id="req-tt" name="testTypeCode" options={testTypes} required /></Field>
      <Field label={t('Consumable')} htmlFor="req-c" required><Select id="req-c" name="consumableId" options={consumables} required /></Field>
      <Field label={t('Quantity per test')} htmlFor="req-q" required hint={t('Taken from the stock when a test of this type ends; 0 removes it.')}>
        <Input id="req-q" name="quantity" inputMode="decimal" required maxLength={12} />
      </Field>
    </ActionForm>
  );
}
