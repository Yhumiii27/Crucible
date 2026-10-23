'use client';
// The R&D director sets the pilot (docs/PILOTE.md): first day, length, facilities, weeks of the reference measure (X-2).
import { ActionForm } from '@/components/app/ActionForm';
import { Field, Input } from '@/components/ds/Field';
import { PILOT_DEFAULTS, type PilotSettings } from '@/domain/pilot';
import { useI18n } from '@/i18n/client';
import { setPilotAction } from './actions';

export function PilotForm({ facilities, current, today }: { facilities: { code: string; name: string }[]; current: PilotSettings | null; today: string }) {
  const { t } = useI18n();
  const chosen = new Set(current?.facilities ?? facilities.map((f) => f.code));
  return (
    <ActionForm action={setPilotAction} submit="Save the pilot" done="Pilot saved">
      <Field label={t('First day of the pilot')} htmlFor="pi-start" required hint={t('From this day, Crucible is the reference of the bookings of the pilot facilities (F-9).')}>
        <Input id="pi-start" name="startOn" type="date" required defaultValue={current?.startOn ?? today} />
      </Field>
      <Field label={t('Weeks of the pilot')} htmlFor="pi-weeks" required>
        <Input id="pi-weeks" name="weeks" type="number" min={1} max={26} required defaultValue={current?.weeks ?? PILOT_DEFAULTS.weeks} />
      </Field>
      <Field label={t('Weeks of the reference measure')} htmlFor="pi-base" required hint={t('The weeks before the first day, measured from the history imported (X-2).')}>
        <Input id="pi-base" name="baselineWeeks" type="number" min={1} max={52} required defaultValue={current?.baselineWeeks ?? PILOT_DEFAULTS.baselineWeeks} />
      </Field>
      <Field label={t('Facilities of the pilot')} required>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {facilities.map((f) => (
            <label key={f.code} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" name="facilities" value={f.code} defaultChecked={chosen.has(f.code)} /> {f.code} · {f.name}
            </label>
          ))}
        </div>
      </Field>
    </ActionForm>
  );
}
