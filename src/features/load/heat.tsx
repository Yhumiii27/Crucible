// Load heat map (delivery 5b, Keystone's "Assignment — next 8 weeks"): one row per resource or exclusion rule, one tile per
// week, its colour by the share of the net capacity (free → over capacity), the percentage in it, the peak at the end. A row
// may link to its facility; a tile's title tells the hours. Server component.
import Link from 'next/link';
import type { T } from '@/i18n/translate';
import { cx } from '@/components/ds/cx';
import s from './heat.module.css';

export interface HeatCell {
  ratio: number | null;
  title: string;
  /** The week holds a closure or is outside the calendar: dashed outline. */
  marked?: boolean;
}

export interface HeatRow {
  key: string;
  code: string;
  /** Typed or translated line under the code. */
  sub: string;
  cells: HeatCell[];
  /** An exclusion rule row (shown in accent). */
  rule?: boolean;
  href?: string;
}

export const heatLevel = (r: number | null): 0 | 1 | 2 | 3 | 4 | 5 =>
  r == null || r <= 0 ? 0 : r > 1 ? 5 : r >= 0.8 ? 4 : r >= 0.5 ? 3 : r >= 0.2 ? 2 : 1;

export function HeatLegend({ t }: { t: T }) {
  return (
    <div className={s.legend}>
      <span>{t('Free')}</span>
      {[0, 1, 2, 3, 4, 5].map((l) => <span key={l} className={cx(s.swatch, s[`l${l}`])} />)}
      <span>{t('Over capacity')}</span>
    </div>
  );
}

export function LoadHeat({ weeks, groups, t, compact, peak = true }: {
  weeks: string[]; groups: { label: string | null; rows: HeatRow[] }[]; t: T; compact?: boolean; peak?: boolean;
}) {
  const cols = `minmax(${compact ? 96 : 160}px, ${compact ? 1 : 1.2}fr) repeat(${weeks.length}, minmax(${compact ? 12 : 44}px, 1fr))${peak ? ` ${compact ? 40 : 56}px` : ''}`;
  return (
    <div className={cx(s.heat, compact && s.compact)}>
      {!compact && (
        <div className={s.head} style={{ gridTemplateColumns: cols }}>
          <span className={s.caps}>{t('Resource')}</span>
          {weeks.map((w) => <span key={w} className={s.week}>{w}</span>)}
          {peak && <span className={cx(s.caps, s.right)}>{t('Peak')}</span>}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.label ?? '-'} className={s.group}>
          {g.label && <div className={s.groupLabel}>{g.label}</div>}
          {g.rows.map((r) => {
            const top = Math.max(0, ...r.cells.map((c) => c.ratio ?? 0));
            const name = (
              <span className={s.name}>
                <span className={cx(s.code, r.rule && s.ruleCode)}>{r.code}</span>
                <span className={s.sub}>{r.sub}</span>
              </span>
            );
            return (
              <div key={r.key} className={s.row} style={{ gridTemplateColumns: cols }}>
                {r.href ? <Link href={r.href} className={s.nameLink}>{name}</Link> : name}
                {r.cells.map((c, i) => (
                  <span key={i} title={c.title} className={cx(s.tile, s[`l${heatLevel(c.ratio)}`], c.marked && s.marked)}>
                    {compact ? '' : c.ratio == null ? '—' : Math.round(c.ratio * 100)}
                  </span>
                ))}
                {peak && <span className={cx(s.peak, top > 1 && s.peakOver)}>{Math.round(top * 100)} %</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
