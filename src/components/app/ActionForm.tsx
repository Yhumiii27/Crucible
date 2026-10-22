'use client';
// Client islands of the Server Functions: a form, a button and a "reason" form, each showing the translated result. The
// Server Functions do every check again; these only collect the input.
import { useActionState, useState, useTransition, type ReactNode } from 'react';
import { Button } from '@/components/ds/Button';
import { useI18n } from '@/i18n/client';
import s from './ActionForm.module.css';

export type ActionResult = { ok: true } | { ok: false; error: string };
export type FormAction = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

export function Result({ state, done }: { state: ActionResult | null; done: string }) {
  const { t } = useI18n();
  if (!state) return null;
  return state.ok ? <span className={s.done} role="status">{t(done)}</span> : <span className={s.error} role="alert">{t(state.error)}</span>;
}

/** A form submitted to its Server Function (React resets its uncontrolled fields after a submit). */
export function ActionForm({ action, submit, done, children, inline, variant = 'primary' }: {
  action: FormAction; submit: string; done: string; children?: ReactNode; inline?: boolean; variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const { t } = useI18n();
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className={inline ? s.inline : s.form}>
      {children}
      <div className={s.actions}>
        <Button type="submit" variant={variant} size={inline ? 'sm' : undefined} disabled={pending}>
          {t(submit)}
        </Button>
        <Result state={state} done={done} />
      </div>
    </form>
  );
}

/** A button calling a Server Function without input. */
export function ActionButton({ run, label, done, variant = 'secondary' }: { run: () => Promise<ActionResult>; label: string; done: string; variant?: 'primary' | 'secondary' | 'ghost' }) {
  const { t } = useI18n();
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className={s.inline}>
      <Button variant={variant} size="sm" disabled={pending} onClick={() => start(async () => setState(await run()))}>
        {t(label)}
      </Button>
      <Result state={state} done={done} />
    </span>
  );
}

/** A folded form ("details"): the summary opens it. */
export function Folded({ summary, children, open }: { summary: string; children: ReactNode; open?: boolean }) {
  const { t } = useI18n();
  return (
    <details className={s.details} open={open}>
      <summary>{t(summary)}</summary>
      {children}
    </details>
  );
}
