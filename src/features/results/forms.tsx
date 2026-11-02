'use client';
// Form of a test result (CR-081): conclusion, measurements one per line, observations, Codex references of the raw data and of
// the lab notebook, ELN entry. Correcting a result starts from the last version and asks why. The Server Function checks again.
import { ActionForm, Folded } from '@/components/app/ActionForm';
import { Field, Input, Select, Textarea } from '@/components/ds/Field';
import { RESULT_OUTCOMES, RESULT_OUTCOME_LABEL, measurementsText, type Measurement, type ResultOutcome } from '@/domain/results';
import { useI18n } from '@/i18n/client';
import { recordResultAction } from './actions';

export interface ResultDraft {
  outcome: ResultOutcome;
  measurements: Measurement[];
  observations: string | null;
  rawDataRef: string | null;
  notebookRef: string | null;
  elnUrl: string | null;
}

export function ResultForm({ bookingId, last }: { bookingId: string; last: ResultDraft | null }) {
  const { t } = useI18n();
  const id = `res-${bookingId}`;
  return (
    <Folded summary={last ? 'Correct the result' : 'Record the result'} size="xs" variant={last ? 'ghost' : 'secondary'} title={last ? 'Correct the result' : 'Record the result'}>
      <ActionForm action={recordResultAction} submit={last ? 'Record the correction' : 'Record the result'} done="Result recorded">
        <input type="hidden" name="bookingId" value={bookingId} />
        <Field label={t('Conclusion')} htmlFor={`${id}-o`} required>
          <Select id={`${id}-o`} name="outcome" defaultValue={last?.outcome ?? ''} required
            options={[{ value: '', label: '—' }, ...RESULT_OUTCOMES.map((o) => ({ value: o, label: t(RESULT_OUTCOME_LABEL[o]) }))]} />
        </Field>
        <Field label={t('Measurements, one per line')} htmlFor={`${id}-m`} hint={t('"name = value unit" or "name; value; unit", e.g. Max pressure = 212 bar')}>
          <Textarea id={`${id}-m`} name="measurements" rows={5} defaultValue={last ? measurementsText(last.measurements) : ''} />
        </Field>
        <Field label={t('Observations')} htmlFor={`${id}-obs`}>
          <Textarea id={`${id}-obs`} name="observations" rows={3} maxLength={4000} defaultValue={last?.observations ?? ''} />
        </Field>
        <Field label={t('Raw data (Codex reference)')} htmlFor={`${id}-raw`} hint={t('The files stay in Codex: Crucible keeps the reference only.')}>
          <Input id={`${id}-raw`} name="rawDataRef" maxLength={60} defaultValue={last?.rawDataRef ?? ''} />
        </Field>
        <Field label={t('Lab notebook (Codex reference)')} htmlFor={`${id}-nb`}>
          <Input id={`${id}-nb`} name="notebookRef" maxLength={60} defaultValue={last?.notebookRef ?? ''} />
        </Field>
        <Field label={t('ELN entry (address)')} htmlFor={`${id}-eln`}>
          <Input id={`${id}-eln`} name="elnUrl" type="url" maxLength={500} placeholder="https://" defaultValue={last?.elnUrl ?? ''} />
        </Field>
        {last && (
          <Field label={t('Why it is corrected')} htmlFor={`${id}-why`} required hint={t('The previous version is kept.')}>
            <Input id={`${id}-why`} name="reason" maxLength={500} required />
          </Field>
        )}
      </ActionForm>
    </Folded>
  );
}
