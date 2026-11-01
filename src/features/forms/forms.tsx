'use client';
// Forms of the bookings (CR-075): the template a facility's manager keeps per stage, and a form filled for a booking. The
// Server Functions do every check again.
import { ActionForm, Folded } from '@/components/app/ActionForm';
import { Field, Textarea } from '@/components/ds/Field';
import { FORM_STAGE_LABEL, itemsText, type FormItem, type FormStage } from '@/domain/booking-forms';
import { useI18n } from '@/i18n/client';
import { fillFormAction, saveFormTemplateAction } from './actions';

export function FormTemplateForm({ facilityCode, stage, items, active }: { facilityCode: string; stage: FormStage; items: FormItem[] | null; active: boolean }) {
  const { t } = useI18n();
  const id = `ft-${stage}`;
  return (
    <ActionForm action={saveFormTemplateAction} submit="Save the form" done="Form saved">
      <input type="hidden" name="facilityCode" value={facilityCode} />
      <input type="hidden" name="stage" value={stage} />
      <Field label={t('Items, one per line')} htmlFor={id} required hint={t('A line starting with "=" asks a written answer; any other line is a box to tick. Every item is required.')}>
        <Textarea id={id} name="items" rows={8} defaultValue={items ? itemsText(items) : ''} required />
      </Field>
      <Field label={t('Asked for every booking of the facility')} htmlFor={`${id}-on`}>
        <input id={`${id}-on`} type="checkbox" name="active" defaultChecked={active} />
      </Field>
    </ActionForm>
  );
}

/** A form to fill for a booking, in a side panel. */
export function FillForm({ bookingId, stage, items, summary }: { bookingId: string; stage: FormStage; items: FormItem[]; summary?: string }) {
  return (
    <Folded summary={summary ?? FORM_STAGE_LABEL[stage]} size="xs" variant={stage === 'before' ? 'primary' : 'secondary'} title={FORM_STAGE_LABEL[stage]}>
      <ActionForm action={fillFormAction} submit="Send" done="Sent">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="stage" value={stage} />
        {items.map((it) => (
          <Field key={it.key} label={it.label} htmlFor={`${bookingId}-${stage}-${it.key}`} required>
            {it.kind === 'check'
              ? <input id={`${bookingId}-${stage}-${it.key}`} type="checkbox" name={it.key} />
              : <Textarea id={`${bookingId}-${stage}-${it.key}`} name={it.key} rows={2} />}
          </Field>
        ))}
      </ActionForm>
    </Folded>
  );
}
