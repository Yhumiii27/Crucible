// Period navigation of a dated screen (Keystone's "Previous week · This week · Next week", delivery 5b): links that keep the
// screen's other parameters, the period shown after them. Server component; labels translated by the caller.
import { CaretDoubleLeft, CaretDoubleRight, CaretLeft, CaretRight } from '@phosphor-icons/react/dist/ssr';
import { ButtonLink } from '@/components/ds/Button';
import s from './PeriodNav.module.css';

export interface PeriodNavProps {
  /** Hrefs and labels: far back (optional), back, current (optional, hidden when null), forward, far forward (optional). */
  farBack?: { href: string; label: string };
  back?: { href: string; label: string } | null;
  current?: { href: string; label: string } | null;
  forward: { href: string; label: string };
  farForward?: { href: string; label: string };
  /** The period shown, e.g. "26 – 30 Oct 2026". */
  period: string;
}

export function PeriodNav({ farBack, back, current, forward, farForward, period }: PeriodNavProps) {
  return (
    <div className={s.nav}>
      {farBack && <ButtonLink href={farBack.href} size="sm" icon={CaretDoubleLeft} scroll={false}>{farBack.label}</ButtonLink>}
      {back && <ButtonLink href={back.href} size="sm" icon={CaretLeft} scroll={false}>{back.label}</ButtonLink>}
      {current && <ButtonLink href={current.href} size="sm" variant="ghost" scroll={false}>{current.label}</ButtonLink>}
      <ButtonLink href={forward.href} size="sm" iconRight={CaretRight} scroll={false}>{forward.label}</ButtonLink>
      {farForward && <ButtonLink href={farForward.href} size="sm" iconRight={CaretDoubleRight} scroll={false}>{farForward.label}</ButtonLink>}
      <span className={s.period}>{period}</span>
    </div>
  );
}
