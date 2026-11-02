'use client';
// Forms of the bench systems' API (CR-083): declaring a client shows its token and its webhook's signing secret once, with an
// example call; a new signing secret is shown once too.
import { useActionState, useState, useTransition } from 'react';
import { ActionButton, Result } from '@/components/app/ActionForm';
import { Button } from '@/components/ds/Button';
import { Field, Input } from '@/components/ds/Field';
import { useI18n } from '@/i18n/client';
import s from '@/features/measure/forms.module.css';
import { createApiClientAction, renewWebhookSecretAction, revokeApiClientAction, type ApiSecrets } from './actions';

function Copyable({ value }: { value: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <>
      <code className={s.code}>{value}</code>
      <Button size="xs" variant="secondary" onClick={() => navigator.clipboard?.writeText(value).then(() => setCopied(true), () => null)}>
        {t(copied ? 'Copied' : 'Copy')}
      </Button>
    </>
  );
}

function Secrets({ state }: { state: ApiSecrets | null }) {
  const { t } = useI18n();
  if (!state) return null;
  if (!state.ok) return <Result state={state} done="" />;
  return (
    <div className={s.secret} role="status">
      {state.token && (
        <>
          <p>{t('Token of the system: keep it secret, it is shown only now.')}</p>
          <Copyable value={state.token} />
          <code className={s.code}>{`curl ${window.location.origin}/api/v1/bookings -H "Authorization: Bearer ${state.token}"`}</code>
        </>
      )}
      {state.webhookSecret && (
        <>
          <p>{t('Signing secret of the webhook (HMAC-SHA256 of the X-Crucible-Signature header): keep it secret, it is shown only now.')}</p>
          <Copyable value={state.webhookSecret} />
        </>
      )}
    </div>
  );
}

export function ApiClientForm({ facilityCode }: { facilityCode: string }) {
  const { t } = useI18n();
  const [state, run, pending] = useActionState(createApiClientAction, null);
  return (
    <form action={run} className={s.form}>
      <input type="hidden" name="facilityCode" value={facilityCode} />
      <Field label={t('Name')} htmlFor="api-label" required hint={t('The system and where it runs, e.g. supervision of bench B2')}>
        <Input id="api-label" name="label" required maxLength={80} />
      </Field>
      <Field label={t('Webhook address')} htmlFor="api-hook" hint={t('Optional: Crucible posts each event of the facility there, signed. Without it the system reads /api/v1/events.')}>
        <Input id="api-hook" name="webhookUrl" type="url" maxLength={500} placeholder="https://" />
      </Field>
      <div className={s.actions}>
        <Button type="submit" variant="primary" disabled={pending}>{t('Add the system')}</Button>
      </div>
      <Secrets state={state} />
    </form>
  );
}

export function RenewSecretButton({ id }: { id: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<ApiSecrets | null>(null);
  const [pending, start] = useTransition();
  return (
    <span>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => setState(await renewWebhookSecretAction(id)))}>
        {t('New signing secret')}
      </Button>
      <Secrets state={state} />
    </span>
  );
}

export function RevokeApiClientButton({ id }: { id: string }) {
  return <ActionButton run={() => revokeApiClientAction(id)} label="Revoke" done="Revoked" variant="ghost" />;
}
