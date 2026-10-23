'use client';
// Client islands of the Server Functions: a form, a button and a "reason" form, each showing the translated result. The
// Server Functions do every check again; these only collect the input. A form placed in a side panel (`Folded`: a button that
// opens it, delivery 5b after Arche's 4b) closes the panel once its Server Function succeeds, and a notice confirms it.
import { NotePencil, Plus } from '@phosphor-icons/react/dist/ssr';
import type { Icon } from '@phosphor-icons/react';
import { createContext, useActionState, useContext, useEffect, useState, useTransition, type ReactNode } from 'react';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ds/Button';
import { Drawer } from '@/components/ds/Drawer';
import { showToast } from '@/components/ds/Toast';
import { useI18n } from '@/i18n/client';
import s from './ActionForm.module.css';

/** `warnings`: what the Server Function accepted but wants the person to know (EN source strings, segments translated). */
export type ActionResult = { ok: true; warnings?: string[] } | { ok: false; error: string };
export type FormAction = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

export function Result({ state, done }: { state: ActionResult | null; done: string }) {
  const { t } = useI18n();
  if (!state) return null;
  if (!state.ok) return <span className={s.error} role="alert">{t(state.error)}</span>;
  return (
    <span className={s.done} role="status">
      {t(done)}
      {state.warnings?.map((w) => (
        <span key={w} className={s.warning}>{t(w)}</span>
      ))}
    </span>
  );
}

/** A form submitted to its Server Function (React resets its uncontrolled fields after a submit). */
export function ActionForm({ action, submit, done, children, inline, variant = 'primary' }: {
  action: FormAction; submit: string; done: string; children?: ReactNode; inline?: boolean; variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const { t } = useI18n();
  const [state, run, pending] = useActionState(action, null);
  const closePanel = useContext(PanelCtx);
  useEffect(() => {
    if (!state?.ok || !closePanel) return;
    closePanel();
    showToast([t(done), ...(state.warnings ?? []).map((w) => t(w))].join(' · '));
  }, [state, closePanel, t, done]);
  return (
    <form action={run} className={inline ? s.inline : closePanel ? s.panelForm : s.form}>
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

const PanelCtx = createContext<(() => void) | null>(null);

const CREATE = /^(Add|New|Declare|Enter|Record|Request|Create|Simulate)\b/;

/**
 * An action that opens a side panel: the button (labelled `summary`; a creation gets a "+", an edit a pencil) and, once
 * clicked, the panel holding the form, closed when its Server Function succeeds. `variant="primary"` for a page's main action.
 */
export function Folded({ summary, children, open, variant = 'secondary', size = 'sm', title, icon }: {
  summary: string; children: ReactNode; open?: boolean; variant?: ButtonVariant; size?: ButtonSize;
  /** Panel title (EN source string), when it differs from the button. */
  title?: string;
  icon?: Icon;
}) {
  const { t } = useI18n();
  const [isOpen, setOpen] = useState(!!open);
  const Ico = icon ?? (CREATE.test(summary) ? Plus : /^(Edit|Change)\b/.test(summary) ? NotePencil : undefined);
  return (
    <>
      <Button variant={variant} size={size} icon={Ico} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {t(summary)}
      </Button>
      <Drawer open={isOpen} onClose={() => setOpen(false)} title={t(title ?? summary)}>
        <PanelCtx.Provider value={() => setOpen(false)}>{children}</PanelCtx.Provider>
      </Drawer>
    </>
  );
}
