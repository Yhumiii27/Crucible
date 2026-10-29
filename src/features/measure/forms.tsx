'use client';
// Forms of the measured occupancy (CR-071) and of the calendar subscriptions (CR-072): a creation shows its secret once (a
// device's token and kiosk address, a subscription's address), with a copy button; the kiosk's two large buttons.
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { ActionButton, Result, type ActionResult } from '@/components/app/ActionForm';
import { Button } from '@/components/ds/Button';
import { Field, Input, Select } from '@/components/ds/Field';
import { DEVICE_KINDS, DEVICE_KIND_LABEL } from '@/domain/occupancy';
import { useI18n } from '@/i18n/client';
import {
  createCalendarFeedAction, createDeviceAction, kioskEventAction, revokeCalendarFeedAction, revokeDeviceAction, type SecretResult,
} from './actions';
import s from './forms.module.css';

interface Opt {
  value: string;
  label: string;
}

/** The secret of a creation, with Crucible's address in front of its path, shown once. */
function Secret({ state, note, children }: { state: SecretResult | null; note: string; children?: (url: string, secret: string) => React.ReactNode }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  if (!state) return null;
  if (!state.ok) return <Result state={state} done="" />;
  // Shown only after a submit, in the browser: the address of the page is Crucible's.
  const url = `${window.location.origin}${state.path}`;
  return (
    <div className={s.secret} role="status">
      <p>{t(note)}</p>
      <code className={s.code}>{url}</code>
      <Button size="xs" variant="secondary" onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true), () => null)}>
        {t(copied ? 'Copied' : 'Copy')}
      </Button>
      {children?.(url, state.secret)}
    </div>
  );
}

export function DeviceForm({ facilityCode, resources }: { facilityCode: string; resources: Opt[] }) {
  const { t } = useI18n();
  const [state, run, pending] = useActionState(createDeviceAction, null);
  return (
    <form action={run} className={s.form}>
      <input type="hidden" name="facilityCode" value={facilityCode} />
      <Field label={t('Resource')} htmlFor="dv-res" required><Select id="dv-res" name="resourceId" options={resources} required /></Field>
      <Field label={t('Kind')} htmlFor="dv-kind" required>
        <Select id="dv-kind" name="kind" options={DEVICE_KINDS.map((k) => ({ value: k, label: t(DEVICE_KIND_LABEL[k]) }))} required />
      </Field>
      <Field label={t('Name')} htmlFor="dv-label" required hint={t('Where it is, e.g. kiosk at the entrance')}><Input id="dv-label" name="label" required maxLength={80} /></Field>
      <div className={s.actions}>
        <Button type="submit" variant="primary" disabled={pending}>{t('Add the device')}</Button>
      </div>
      <Secret state={state} note="Kiosk address: open it on the tablet at the entrance of the resource. Keep it secret: it is shown only now.">
        {(_url, secret) => (
          <>
            <p>{t('An agent, an interlock or a badge reader sends its events to /api/occupancy with this token:')}</p>
            <code className={s.code}>{`curl -X POST <Crucible>/api/occupancy -H "Authorization: Bearer ${secret}" -H "Content-Type: application/json" -d '{"event":"start"}'`}</code>
          </>
        )}
      </Secret>
    </form>
  );
}

export function RevokeDeviceButton({ id }: { id: string }) {
  return <ActionButton run={() => revokeDeviceAction(id)} label="Revoke" done="Revoked" variant="ghost" />;
}

export function CalendarFeedForm({ resources }: { resources: Opt[] }) {
  const { t } = useI18n();
  const [state, run, pending] = useActionState(createCalendarFeedAction, null);
  const [scope, setScope] = useState('mine');
  return (
    <form action={run} className={s.form}>
      <Field label={t('Calendar')} htmlFor="cf-scope" required>
        <Select id="cf-scope" name="scope" value={scope} onChange={(e) => setScope(e.target.value)}
          options={[{ value: 'mine', label: t('My tests') }, ...(resources.length ? [{ value: 'resource', label: t('A resource') }] : [])]} />
      </Field>
      {scope === 'resource' && <Field label={t('Resource')} htmlFor="cf-res" required><Select id="cf-res" name="resourceId" options={resources} required /></Field>}
      <div className={s.actions}>
        <Button type="submit" variant="primary" disabled={pending}>{t('Create the address')}</Button>
      </div>
      <Secret state={state} note="Outlook: Add calendar › Subscribe from web, paste this address; the calendar also shows in Teams. Keep it secret: it is shown only now." />
    </form>
  );
}

export function RevokeFeedButton({ id }: { id: string }) {
  return <ActionButton run={() => revokeCalendarFeedAction(id)} label="Revoke" done="Revoked" variant="ghost" />;
}

/** The kiosk's two buttons; the result stays until the next press. The page is read again every minute. */
export function KioskButtons({ token, running }: { token: string; running: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
  }, [router]);
  const press = (kind: 'start' | 'stop') => start(async () => setState(await kioskEventAction(token, kind)));
  return (
    <div className={s.kiosk}>
      <Button variant={running ? 'secondary' : 'primary'} disabled={pending} onClick={() => press('start')}>{t('Start')}</Button>
      <Button variant={running ? 'primary' : 'secondary'} disabled={pending} onClick={() => press('stop')}>{t('Stop')}</Button>
      <Result state={state} done="Recorded" />
    </div>
  );
}
