// Load forecast (docs/spec/03 §6, 05 "Plan de charge"; delivery 3): per resource and per week over 26 weeks (F-6), the load —
// held by bookings, asked by requests, and the open needs not booked yet spread over their window — against the net capacity;
// the resources tied by a validated exclusion rule are also shown together (P-2: one zone of the PDE at a time). Bottlenecks
// (over capacity) are signalled as early as the needs are known; gaps (under 30 % in the next 12 weeks, F-12) are slots to
// offer. Beyond 26 weeks, the envelopes are summed by quarter up to 12 months. Computed at display, never stored. A need of
// a project the viewer may not see shows its entity only (U-3).
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/app/EmptyState';
import { KpiGrid, KpiTile } from '@/components/app/Kpi';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Tag } from '@/components/ds/Tag';
import { Table, Td, Th } from '@/components/ds/Table';
import { canSee } from '@/config/screens';
import { BOTTLENECK_ABOVE, GAP_BELOW, GAP_WEEKS, byQuarter, type LoadSignal, type WeekLoad } from '@/domain/load';
import { NEED_LEVEL_LABEL } from '@/domain/needs';
import { dataText } from '@/i18n/data-text';
import { addDaysIso } from '@/lib/dates';
import { fmtDate } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { DETAIL_WEEKS, loadScreen } from '@/server/dal/needs';
import { getI18n, getViewer } from '@/server/session';
import s from './load.module.css';

const pct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}`);

/** Consecutive weeks (Mondays) grouped into [first, last] ranges. */
function ranges(mondays: readonly string[]): [string, string][] {
  const out: [string, string][] = [];
  for (const m of [...mondays].sort()) {
    const last = out[out.length - 1];
    if (last && addDaysIso(last[1], 7) === m) last[1] = m;
    else out.push([m, m]);
  }
  return out;
}

export default async function LoadPage() {
  const [{ t, lang }, viewer, today] = await Promise.all([getI18n(), getViewer(), businessToday()]);
  if (!canSee(viewer.role, 'load')) notFound();
  const data = await loadScreen(viewer, today);
  const detail = data.weeks.slice(0, DETAIL_WEEKS);
  const nf = (n: number) => n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB');
  const cellClass = (w: WeekLoad, gapsHere: boolean) =>
    w.ratio == null ? s.none : w.ratio > BOTTLENECK_ABOVE ? s.over : w.ratio >= 0.8 ? s.high : gapsHere && w.ratio < GAP_BELOW ? s.gap : '';
  const cellTitle = (w: WeekLoad) =>
    `${t('Week of')} ${fmtDate(w.monday, lang)} — ${t('Capacity')} ${nf(w.capacityHours)} h · ${t('Booked')} ${nf(w.bookedHours)} h · ${t('Requested')} ${nf(w.requestedHours)} h · ${t('Requests not booked')} ${nf(w.requestHours)} h · ${t('Forecasts')} ${nf(w.forecastHours)} h`;
  const grouped = new Set(data.rules.flatMap((r) => r.resourceIds));
  const bottlenecks = data.signals.filter((x) => x.kind === 'bottleneck' && x.weeksAhead < DETAIL_WEEKS);
  const gaps = data.signals.filter((x) => x.kind === 'gap');
  const gapsBy = new Map<string, LoadSignal[]>();
  for (const g of gaps) gapsBy.set(g.subject, [...(gapsBy.get(g.subject) ?? []), g]);
  const weekLabel = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: '2-digit' });
  const row = (key: string, name: string, sub: string, rows: WeekLoad[], gapsHere: boolean, rule = false) => (
    <tr key={key} className={rule ? s.rule : undefined}>
      <td className={s.name}>{name}<small>{sub}</small></td>
      {rows.slice(0, DETAIL_WEEKS).map((w) => (
        <td key={w.monday} className={`${s.cell} ${cellClass(w, gapsHere)}`} title={cellTitle(w)}>{pct(w.ratio)}</td>
      ))}
    </tr>
  );
  const needsAhead = data.needs.filter((n) => n.spread && n.spread.remainingHours > 0);

  return (
    <>
      <PageHeader screen="load" />
      <KpiGrid min={190}>
        <KpiTile label={t('Bottlenecks in the next 26 weeks')} value={bottlenecks.length}
          sub={bottlenecks[0] ? `${bottlenecks[0].subject} · ${t('Week of')} ${fmtDate(bottlenecks[0].monday, lang)} · ${t('in')} ${bottlenecks[0].weeksAhead} ${t('weeks')}` : t('None')} size="lg" />
        <KpiTile label={t('Open needs not booked yet')} value={needsAhead.length} sub={`${nf(needsAhead.reduce((a, n) => a + (n.spread?.remainingHalfDays ?? 0), 0) / 2)} ${t('days of tests')}`} size="lg" />
        <KpiTile label={t('Weeks with room')} value={gaps.length} sub={`${t('under')} ${Math.round(GAP_BELOW * 100)} % · ${GAP_WEEKS} ${t('weeks')}`} size="lg" />
      </KpiGrid>

      <SectionCard title={t('Bottlenecks')} subtitle={t('Weeks where the load exceeds the net capacity: arbitrate early, or move the tests that can move.')}>
        {bottlenecks.length ? (
          <div className={s.signals}>
            {bottlenecks.map((b) => {
              const rule = data.rules.find((r) => r.code === b.subject);
              const resIds = rule ? rule.resourceIds : data.resources.filter((r) => r.code === b.subject).map((r) => r.id);
              const end = addDaysIso(b.monday, 4);
              const contributing = data.needs.filter((n) => resIds.includes(n.resourceId) && n.spread && n.spread.remainingHours > 0 && n.earliestOn <= end && n.deadlineOn >= b.monday);
              return (
                <div key={`${b.subject}-${b.monday}`}>
                  <Tag tone="accent" size="sm">{pct(b.ratio)} %</Tag>{' '}
                  <strong>{b.subject}</strong> · {t('Week of')} {fmtDate(b.monday, lang)} · {t('in')} {b.weeksAhead} {t('weeks')}
                  {contributing.length > 0 && (
                    <span className="text-muted"> — {contributing.map((n) => `${n.ref} ${n.projectCode ?? (n.confidential ? t('Confidential') : n.entityCode)} (${n.resourceCode})`).join(', ')}</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState>{t('No bottleneck in the next 26 weeks.')}</EmptyState>
        )}
      </SectionCard>

      {data.inspectionAlerts.length > 0 && (
        <SectionCard title={t('Inspections to renew before the planned tests')} subtitle={t('A slot ending after an inspection’s due date is refused until the new inspection is recorded (R-10).')}>
          <div className={s.signals}>
            {data.inspectionAlerts.map((a) => (
              <div key={`${a.needRef}-${a.label}`}>
                <strong>{a.resourceCode}</strong> · {dataText(a.label, lang)} · {t('due')} {fmtDate(a.dueOn, lang)} — {t('Need')} {a.needRef}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title={t('Load by week')} subtitle={t('Load in % of the net capacity: bookings, requests and open needs not booked yet. A need is spread over the open hours of its window.')} actions={
        <div className={s.legend}>
          <span><i className={`${s.swatch} ${s.over}`} />{t('Over capacity')}</span>
          <span><i className={`${s.swatch} ${s.high}`} />{t('80 % and more')}</span>
          <span><i className={`${s.swatch} ${s.gap}`} />{t('Room to offer')}</span>
        </div>
      }>
        {data.resources.length ? (
          <div className={s.scroll}>
            <table className={s.grid}>
              <thead>
                <tr>
                  <th>{t('Resource')}</th>
                  {detail.map((m) => <th key={m} className={s.week}>{weekLabel(m)}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.facilities.map((f) => {
                  const rules = data.rules.filter((r) => r.facilityCodes.includes(f.code));
                  const res = data.resources.filter((r) => r.facilityCode === f.code);
                  if (!res.length) return null;
                  return [
                    <tr key={f.code} className={s.facility}><th colSpan={DETAIL_WEEKS + 1}>{dataText(f.name, lang)}</th></tr>,
                    ...rules.map((r) => row(r.code, r.code, t('Exclusion rule'), data.forecast.byRule.get(r.code) ?? [], true, true)),
                    ...res.map((r) => row(r.id, r.code, dataText(r.name, lang), data.forecast.byResource.get(r.id) ?? [], !grouped.has(r.id))),
                  ];
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>{t('No resource in your scope.')}</EmptyState>
        )}
      </SectionCard>

      {gapsBy.size > 0 && (
        <SectionCard title={t('Room to offer')} subtitle={t('Weeks (by their Monday) of the next quarter under 30 % of the capacity: slots to offer to the projects that could move their tests forward.')}>
          <div className={s.signals}>
            {[...gapsBy].map(([subject, xs]) => (
              <div key={subject}><strong>{subject}</strong> · {ranges(xs.map((g) => g.monday)).map(([a, b]) => (a === b ? weekLabel(a) : `${weekLabel(a)} → ${weekLabel(b)}`)).join(', ')}</div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title={t('Envelopes beyond 26 weeks')} subtitle={t('Load and capacity by quarter, in hours, up to 12 months (F-6).')} scroll>
        {(() => {
          const later = (rows: WeekLoad[]) => byQuarter(rows.slice(DETAIL_WEEKS));
          const subjects = [
            ...data.rules.map((r) => ({ key: r.code, name: r.code, rows: later(data.forecast.byRule.get(r.code) ?? []) })),
            ...data.resources.map((r) => ({ key: r.id, name: r.code, rows: later(data.forecast.byResource.get(r.id) ?? []) })),
          ];
          const quarters = subjects[0]?.rows.map((q) => q.quarter) ?? [];
          return quarters.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>{t('Resource')}</Th>
                  {quarters.map((q) => <Th key={q} align="right">{q}</Th>)}
                </tr>
              </thead>
              <tbody>
                {subjects.map((x) => (
                  <tr key={x.key}>
                    <Td>{x.name}</Td>
                    {x.rows.map((q) => <Td key={q.quarter} align="right" numeric>{pct(q.ratio)} % · {nf(q.loadHours)} / {nf(q.capacityHours)} h</Td>)}
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState>{t('No resource in your scope.')}</EmptyState>;
        })()}
      </SectionCard>

      <SectionCard title={t('Open needs not booked yet')} hint={String(needsAhead.length)} scroll>
        {needsAhead.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Need')}</Th>
                <Th>{t('Project')}</Th>
                <Th>{t('Resource')}</Th>
                <Th>{t('Window')}</Th>
                <Th align="right">{t('Days left')}</Th>
              </tr>
            </thead>
            <tbody>
              {needsAhead.map((n) => (
                <tr key={n.id}>
                  <Td>{n.ref} <Tag size="xs" tone={n.level === 'request' ? 'accent' : 'outline'}>{t(NEED_LEVEL_LABEL[n.level])}</Tag></Td>
                  <Td>{n.projectCode ? `${n.projectCode} · ${dataText(n.title ?? '', lang)}` : n.confidential ? t('Confidential project') : `${t('Project of')} ${n.entityCode}`}</Td>
                  <Td>{n.resourceCode}</Td>
                  <Td nowrap>
                    {fmtDate(n.earliestOn, lang)} → {fmtDate(n.deadlineOn, lang)}
                    {n.spread?.overdue && <Tag size="xs" tone="accent" style={{ marginLeft: 6 }}>{t('Overdue')}</Tag>}
                  </Td>
                  <Td align="right" numeric>{nf((n.spread?.remainingHalfDays ?? 0) / 2)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No open need.')}</EmptyState>
        )}
      </SectionCard>
    </>
  );
}
