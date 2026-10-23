'use client';
// The assistant panel (docs/spec/04, 05 "Assistant: panneau de conversation disponible sur chaque écran"; delivery 6): mounted
// once in the app shell, opened by the header's Assistant button or by an "Ask the assistant" shortcut of a screen
// (openAssistant). It says which provider answers and what leaves Crucible, shows the conversation, and offers what a turn
// prepared — a need draft to open in the needs form, minutes to decide a conflict with. The person validates there.
import { ArrowUp, ChatCircleDots, Plus, Sparkle, Warning } from '@phosphor-icons/react/dist/ssr';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from 'react';
import { Button, ButtonLink } from '@/components/ds/Button';
import { Drawer } from '@/components/ds/Drawer';
import { Textarea } from '@/components/ds/Field';
import { Tag } from '@/components/ds/Tag';
import { LOOKUP_LABEL, type AnswerPart, type Cell, type ConversationView, type TurnView } from '@/domain/assistant-answer';
import { useI18n } from '@/i18n/client';
import type { T } from '@/i18n/translate';
import { askAssistantAction, loadAssistantAction } from './actions';
import s from './panel.module.css';

const OPEN_EVENT = 'crucible:assistant';

/** Opens the panel; with a question, asks it at once. */
export function openAssistant(question?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { question: question ?? null } }));
}

/** The header's button. */
export function AssistantButton() {
  const { t } = useI18n();
  return (
    <Button variant="ghost" size="sm" icon={Sparkle} onClick={() => openAssistant()} aria-haspopup="dialog">
      {t('Assistant')}
    </Button>
  );
}

/** A screen's shortcut: asks a question built for the line (a need, a conflict). */
export function AskButton({ question, label = 'Ask the assistant' }: { question: { fr: string; en: string }; label?: string }) {
  const { t, lang } = useI18n();
  return (
    <Button variant="ghost" size="xs" icon={ChatCircleDots} onClick={() => openAssistant(question[lang])}>
      {t(label)}
    </Button>
  );
}

function cellText(c: Cell, t: T): string {
  if (typeof c === 'string') return c;
  return [c.num, t(c.en)].filter(Boolean).join(' ') + (c.ref ? ` · ${c.ref}` : '');
}

/** Model text: paragraphs, "- " lists and **bold**, as React nodes (never as HTML). */
function ModelText({ text }: { text: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/).map((x, i) => (/^\*\*[^*]+\*\*$/.test(x) ? <strong key={i}>{x.slice(2, -2)}</strong> : x));
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`l${blocks.length}`} className={s.list}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const item = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const head = /^#{1,4}\s+(.*)$/.exec(line);
    blocks.push(head ? <p key={`h${blocks.length}`} className={s.head}>{inline(head[1])}</p> : <p key={`p${blocks.length}`}>{inline(line)}</p>);
  }
  flush();
  return <div className={s.modelText}>{blocks}</div>;
}

function Part({ p, turn, ask }: { p: AnswerPart; turn: TurnView; ask: (q: string) => void }) {
  const { t } = useI18n();
  switch (p.kind) {
    case 'text':
      return turn.provider === 'claude' ? <ModelText text={p.text} /> : <pre className={s.minutes}>{p.text}</pre>;
    case 'title':
      return <p className={s.partTitle}>{t(p.en)}{p.ref ? ` · ${p.ref}` : ''}</p>;
    case 'note':
      return <p className={s.note}>{t(p.en)}{p.ref ? ` · ${p.ref}` : ''}</p>;
    case 'facts':
      return (
        <dl className={s.facts}>
          {p.rows.map((r, i) => (
            <div key={i} className={s.fact}><dt>{t(r.en)}</dt><dd>{cellText(r.value, t)}</dd></div>
          ))}
        </dl>
      );
    case 'table':
      return (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr>{p.columns.map((c) => <th key={c}>{t(c)}</th>)}</tr></thead>
            <tbody>{p.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{cellText(c, t)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case 'links':
      return (
        <div className={s.links}>
          {p.links.map((l) => {
            const href = l.turn ? `${l.href}${l.href.includes('?') ? '&' : '?'}turn=${turn.id}` : l.href;
            return <ButtonLink key={href} href={href} variant="secondary" size="xs">{t(l.en)}</ButtonLink>;
          })}
        </div>
      );
    case 'examples':
      return (
        <div className={s.examples}>
          {p.questions.map((q) => <button key={q} type="button" className={s.example} onClick={() => ask(q)}>{q}</button>)}
        </div>
      );
  }
}

function Turn({ turn, ask }: { turn: TurnView; ask: (q: string) => void }) {
  const { t } = useI18n();
  return (
    <div className={s.turn}>
      <div className={s.question}>{turn.question}</div>
      <div className={s.answer}>
        {turn.notice && <p className={s.notice}><Warning size={13} /> {t(turn.notice)} · {t('answered with the templates')}</p>}
        {turn.answer.map((p, i) => <Part key={i} p={p} turn={turn} ask={ask} />)}
        {turn.draft && (
          <div className={s.draft}>
            <p className={s.partTitle}>{t('Need prepared, not recorded')}</p>
            <dl className={s.facts}>
              <div className={s.fact}><dt>{t('Project')}</dt><dd>{turn.draft.projectCode}</dd></div>
              <div className={s.fact}><dt>{t('Tests needed')}</dt><dd>{turn.draft.title}</dd></div>
              <div className={s.fact}><dt>{t('Resource')}</dt><dd>{[turn.draft.resourceCode, turn.draft.testTypeCode].filter(Boolean).join(' · ')}</dd></div>
              <div className={s.fact}><dt>{t('Half-days')}</dt><dd>{turn.draft.halfDays}</dd></div>
              <div className={s.fact}><dt>{t('Window')}</dt><dd>{`${turn.draft.earliestOn} → ${turn.draft.deadlineOn}`}{turn.draft.milestoneLabel ? ` · ${turn.draft.milestoneLabel}` : ''}</dd></div>
            </dl>
            {turn.draft.warnings.map((w) => <p key={w} className={s.notice}><Warning size={13} /> {t(w)}</p>)}
            <ButtonLink href={`/my/needs?draft=${turn.id}`} variant="primary" size="sm">{t('Open the form to check and record it')}</ButtonLink>
          </div>
        )}
        <p className={s.meta}>
          {turn.provider === 'claude' ? `Claude · ${turn.model ?? ''}` : t('Templates, without AI')}
          {turn.lookups.length > 0 && ` · ${t('looked up')} : ${turn.lookups.map((l) => t(LOOKUP_LABEL[l] ?? l)).join(', ')}`}
        </p>
      </div>
    </div>
  );
}

export function AssistantPanel() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ provider: 'local' | 'claude'; model: string | null; conversation: ConversationView | null } | null>(null);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  const ask = useCallback((q: string, conversationId: string | null) => {
    const text = q.trim();
    if (!text) return;
    setError(null);
    start(async () => {
      const r = await askAssistantAction(conversationId, text, pathname);
      if (r.ok) {
        setState((st) => ({ provider: st?.provider ?? 'local', model: st?.model ?? null, conversation: r.conversation }));
        setQuestion('');
      } else setError(r.error);
    });
  }, [pathname]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const q = (e as CustomEvent<{ question: string | null }>).detail?.question;
      setOpen(true);
      start(async () => {
        const st = loaded.current ? null : await loadAssistantAction(null);
        if (st) {
          loaded.current = true;
          setState(st);
        }
        if (q) {
          const r = await askAssistantAction(st?.conversation?.id ?? null, q, window.location.pathname);
          if (r.ok) setState((x) => ({ provider: x?.provider ?? 'local', model: x?.model ?? null, conversation: r.conversation }));
          else setError(r.error);
        }
      });
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [state?.conversation?.turns.length, pending]);
  // A link of an answer opens another screen: the panel steps aside (the conversation is kept).
  const [shownOn, setShownOn] = useState(pathname);
  if (shownOn !== pathname) {
    setShownOn(pathname);
    setOpen(false);
  }

  const conv = state?.conversation ?? null;
  const send = () => ask(question, conv?.id ?? null);
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  return (
    <Drawer open={open} onClose={() => setOpen(false)} width={640} title={t('Assistant')} id={conv?.ref}
      actions={conv ? <Button variant="ghost" size="xs" icon={Plus} onClick={() => setState((x) => (x ? { ...x, conversation: null } : x))}>{t('New conversation')}</Button> : undefined}>
      <div className={s.panel}>
        {state && (
          <p className={s.provider}>
            <Tag tone={state.provider === 'claude' ? 'accent' : 'outline'} size="xs">{state.provider === 'claude' ? `Claude · ${state.model ?? ''}` : t('Without AI')}</Tag>
            {state.provider === 'claude'
              ? t('Your question and the data looked up are sent to Anthropic, without confidential projects. The assistant writes nothing: you validate on the usual screens.')
              : t('Answers built from Crucible’s data with templates; nothing leaves Crucible. The assistant writes nothing: you validate on the usual screens.')}
          </p>
        )}
        <div className={s.thread}>
          {!conv?.turns.length && !pending && (
            <p className={s.empty}>{t('Ask about a need, a conflict, where to run a test, the load risks, or a resource out. The assistant sees what you see.')}</p>
          )}
          {conv?.turns.map((x) => <Turn key={x.id} turn={x} ask={(q) => ask(q, conv.id)} />)}
          {pending && <p className={s.thinking}>{t('The assistant is looking…')}</p>}
          {error && <p className={s.error} role="alert">{t(error)}</p>}
          <div ref={endRef} />
        </div>
        <div className={s.composer}>
          <Textarea short value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={onKey} maxLength={2000}
            placeholder={t('Your question…')} aria-label={t('Your question')} disabled={pending} />
          <Button variant="primary" size="sm" icon={ArrowUp} onClick={send} disabled={pending || !question.trim()}>{t('Ask')}</Button>
        </div>
        <p className={s.meta}>{t('Exchanges are kept in Crucible and cited in the journal of what you record from them.')}</p>
      </div>
    </Drawer>
  );
}
