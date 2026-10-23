// Load forecast (docs/spec/03 §6, 05 "Plan de charge"; delivery 3): per resource and per week over 26 weeks (F-6), the load —
// held by bookings, asked by requests, and the open needs not booked yet spread over their window — against the net capacity;
// the resources tied by a validated exclusion rule are also shown together (P-2: one zone of the PDE at a time). Bottlenecks
// (over capacity) are signalled as early as the needs are known; gaps (under 30 % in the next 12 weeks, F-12) are slots to
// offer. Beyond 26 weeks, the envelopes are summed by quarter up to 12 months. Computed at display, never stored. A need of
// a project the viewer may not see shows its entity only (U-3). Delivery 5b (Keystone's "Resources"): a heat map of 8 weeks
// navigable over the 26 (or the quarters up to 12 months), capacity against demand per facility, the bottleneck to deal with.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { EmptyState } from '@/components/app/EmptyState';
import { KpiGrid, KpiTile } from '@/components/app/Kpi';
import { SectionCard } from '@/components/app/SectionCard';
import { PeriodNav } from '@/components/app/PeriodNav';
import { PageHeader } from '@/components/app/shell/page-header';
import { ButtonLink } from '@/components/ds/Button';
import { Segmented } from '@/components/ds/Segmented';
import { Tag } from '@/components/ds/Tag';
import { Table, Td, Th } from '@/components/ds/Table';
import { canSee } from '@/config/screens';
import { GAP_BELOW, GAP_WEEKS, byQuarter, type LoadSignal, type WeekLoad } from '@/domain/load';
import { NEED_LEVEL_LABEL } from '@/domain/needs';
import { HeatLegend, LoadHeat } from '@/features/load/heat';
import { heatGroups } from '@/features/load/heat-data';
import { dataText } from '@/i18n/data-text';
import { addDaysIso } from '@/lib/dates';
import { fmtDate } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { DETAIL_WEEKS, loadScreen } from '@/server/dal/needs';
import { getI18n, getViewer } from '@/server/session';
import s from './load.module.css';

const WINDOW = 8;
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

export default async function LoadPage({ searchParams }: PageProps<'/load'>) {
  const [{ t, lang }, viewer, today, sp] = await Promise.all([getI18n(), getViewer(), businessToday(), searchParams]);
  if (!canSee(viewer.role, 'load')) notFound();
  const data = await loadScreen(viewer, today);
  const quarters = sp.view === 'quarters';
  const from = Math.min(Math.max(0, Math.floor(Number(typeof sp.from === 'string' ? sp.from : 0)) || 0), DETAIL_WEEKS - WINDOW);
  const nf = (n: number) => n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB');
  const bottlenecks = data.signals.filter((x) => x.kind === 'bottleneck' && x.weeksAhead < DETAIL_WEEKS);
  const gaps = data.signals.filter((x) => x.kind === 'gap');
  const gapsBy = new Map<string, LoadSignal[]>();
  for (const g of gaps) gapsBy.set(g.subject, [...(gapsBy.get(g.subject) ?? []), g]);
  const weekLabel = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: '2-digit' });
  const needsAhead = data.needs.filter((n) => n.spread && n.spread.remainingHours > 0);
  const shown = data.weeks.slice(from, from + WINDOW);
  const href = (o: { from?: number; view?: string | null }) => {
    const q = new URLSearchParams();
    const f = o.from ?? from;
    if (f) q.set('from', String(f));
    const v = o.view === undefined ? (quarters ? 'quarters' : null) : o.view;
    if (v) q.set('view', v);
    const qs = q.toString();
    return `/load${qs ? `?${qs}` : ''}`;
  };
  // Capacity against demand over the window, per facility: through its exclusion rule when it has one (one zone of the PDE at a
  // time: the rule's capacity is the facility's), else the sum of its resources.
  const sum = (rows: WeekLoad[] | undefined) => (rows ?? []).slice(from, from + WINDOW).reduce((a, w) => ({ load: a.load + w.loadHours, cap: a.cap + w.capacityHours }), { load: 0, cap: 0 });
  const capacity = data.facilities.map((f) => {
    const rules = data.rules.filter((r) => r.facilityCodes.includes(f.code));
    const ruled = new Set(rules.flatMap((r) => r.resourceIds));
    const parts = [...rules.map((r) => sum(data.forecast.byRule.get(r.code))), ...data.resources.filter((r) => r.facilityCode === f.code && !ruled.has(r.id)).map((r) => sum(data.forecast.byResource.get(r.id)))];
    const tot = parts.reduce((a, x) => ({ load: a.load + x.load, cap: a.cap + x.cap }), { load: 0, cap: 0 });
    return { code: f.code, name: dataText(f.name, lang), ruled: rules.length > 0, ...tot };
  }).filter((c) => c.cap > 0 || c.load > 0);

  return (
    <>
      <PageHeader
        screen="load"
        crumbs={['Planning']}
        toolbar={
          <>
            <Segmented
              label={t('View')}
              value={quarters ? 'quarters' : 'weeks'}
              options={[
                { value: 'weeks', label: t('8 weeks'), href: href({ view: null }) },
                { value: 'quarters', label: t('By quarter · 12 months'), href: href({ view: 'quarters' }) },
              ]}
            />
            {!quarters && (
              <PeriodNav
                farBack={from > 0 ? { href: href({ from: Math.max(0, from - WINDOW) }), label: t('8 previous weeks') } : undefined}
                back={from > 0 ? { href: href({ from: from - 1 }), label: t('Previous week') } : null}
                current={from ? { href: href({ from: 0 }), label: t('This week') } : null}
                forward={{ href: href({ from: Math.min(DETAIL_WEEKS - WINDOW, from + 1) }), label: t('Next week') }}
                farForward={from < DETAIL_WEEKS - WINDOW ? { href: href({ from: Math.min(DETAIL_WEEKS - WINDOW, from + WINDOW) }), label: t('8 next weeks') } : undefined}
                period={`${fmtDate(shown[0], lang)} → ${fmtDate(addDaysIso(shown[shown.length - 1], 4), lang)}`}
              />
            )}
          </>
        }
        primary={canSee(viewer.role, 'propose') ? <ButtonLink href="/propose" variant="primary">{t('Run the engine')}</ButtonLink> : undefined}
      />
      <KpiGrid min={190}>
        <KpiTile label={t('Bottlenecks in the next 26 weeks')} value={bottlenecks.length}
          sub={bottlenecks[0] ? `${bottlenecks[0].subject} · ${t('Week of')} ${fmtDate(bottlenecks[0].monday, lang)} · ${t('in')} ${bottlenecks[0].weeksAhead} ${t('weeks')}` : t('None')} size="lg" />
        <KpiTile label={t('Open needs not booked yet')} value={needsAhead.length} sub={`${nf(needsAhead.reduce((a, n) => a + (n.spread?.remainingHalfDays ?? 0), 0) / 2)} ${t('days of tests')}`} size="lg" />
        <KpiTile label={t('Weeks with room')} value={gaps.length} sub={`${t('under')} ${Math.round(GAP_BELOW * 100)} % · ${GAP_WEEKS} ${t('weeks')}`} size="lg" />
        <KpiTile label={t('Inspections to renew')} value={data.inspectionAlerts.length} sub={data.inspectionAlerts[0] ? `${data.inspectionAlerts[0].resourceCode} · ${t('due')} ${fmtDate(data.inspectionAlerts[0].dueOn, lang)}` : t('None')} size="lg" />
      </KpiGrid>

      <div className={s.layout}>
        {quarters ? (
          <SectionCard title={t('Envelopes by quarter')} subtitle={t('Load and capacity by quarter, in hours, up to 12 months (F-6).')} scroll flex="999 1 640px">
            {(() => {
              const subjects = [
                ...data.rules.map((r) => ({ key: r.code, name: r.code, rows: byQuarter(data.forecast.byRule.get(r.code) ?? []) })),
                ...data.resources.map((r) => ({ key: r.id, name: r.code, rows: byQuarter(data.forecast.byResource.get(r.id) ?? []) })),
              ];
              const qs = subjects[0]?.rows.map((q) => q.quarter) ?? [];
              return qs.length ? (
                <Table>
                  <thead>
                    <tr>
                      <Th>{t('Resource')}</Th>
                      {qs.map((q) => <Th key={q} align="right">{q}</Th>)}
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
        ) : (
          <SectionCard title={t('Load — 8 weeks')} subtitle={t('Load in % of the net capacity: bookings, requests and open needs not booked yet. A need is spread over the open hours of its window.')} scroll flex="999 1 640px" actions={<HeatLegend t={t} />}>
            {data.resources.length ? <LoadHeat weeks={shown.map(weekLabel)} groups={heatGroups(data, from, WINDOW, t, lang)} t={t} /> : <EmptyState>{t('No resource in your scope.')}</EmptyState>}
          </SectionCard>
        )}

        <div className={s.side}>
          <SectionCard title={t('Capacity vs demand')} subtitle={quarters ? t('Hours per facility, next 8 weeks') : `${t('Hours per facility')} · ${fmtDate(shown[0], lang)} → ${fmtDate(addDaysIso(shown[shown.length - 1], 4), lang)}`}>
            {capacity.map((c) => (
              <div key={c.code} className={s.cap}>
                <div className={s.capHead}><span>{c.name}</span><span>{nf(Math.round(c.load))} / {nf(Math.round(c.cap))} h</span></div>
                <div className={s.capBar}><span style={{ width: `${Math.min(100, c.cap ? (c.load / c.cap) * 100 : 0)}%` }} className={c.load > c.cap ? s.capOver : undefined} /></div>
                {c.ruled && <span className={s.capSub}>{t('Capacity of one zone at a time: the exclusion rule shares it between the resources')}</span>}
              </div>
            ))}
          </SectionCard>

          <SectionCard title={t('Bottlenecks')} hint={String(bottlenecks.length)}>
            {bottlenecks.length ? bottlenecks.map((b) => {
              const rule = data.rules.find((r) => r.code === b.subject);
              const resIds = rule ? rule.resourceIds : data.resources.filter((r) => r.code === b.subject).map((r) => r.id);
              const end = addDaysIso(b.monday, 4);
              const contributing = data.needs.filter((n) => resIds.includes(n.resourceId) && n.spread && n.spread.remainingHours > 0 && n.earliestOn <= end && n.deadlineOn >= b.monday);
              return (
                <div key={`${b.subject}-${b.monday}`} className={s.signal}>
                  <span><Tag tone="accent" size="sm">{pct(b.ratio)} %</Tag> <strong>{b.subject}</strong> · {t('Week of')} {fmtDate(b.monday, lang)} · {t('in')} {b.weeksAhead} {t('weeks')}</span>
                  {contributing.length > 0 && (
                    <span className="text-muted">{contributing.map((n) => `${n.ref} ${n.projectCode ?? (n.confidential ? t('Confidential') : n.entityCode)} (${n.resourceCode})`).join(', ')}</span>
                  )}
                </div>
              );
            }) : <EmptyState>{t('No bottleneck in the next 26 weeks.')}</EmptyState>}
            {bottlenecks.length > 0 && canSee(viewer.role, 'conflicts') && <Link href="/conflicts">{t('Conflicts & arbitration')}</Link>}
          </SectionCard>

          {data.inspectionAlerts.length > 0 && (
            <SectionCard title={t('Inspections to renew before the planned tests')} subtitle={t('A slot ending after an inspection’s due date is refused until the new inspection is recorded (R-10).')}>
              {data.inspectionAlerts.map((a) => (
                <div key={`${a.needRef}-${a.label}`} className={s.signal}>
                  <span><strong>{a.resourceCode}</strong> · {dataText(a.label, lang)} · {t('due')} {fmtDate(a.dueOn, lang)}</span>
                  <span className="text-muted">{t('Need')} {a.needRef}</span>
                </div>
              ))}
            </SectionCard>
          )}

          {gapsBy.size > 0 && (
            <SectionCard title={t('Room to offer')} subtitle={t('Weeks (by their Monday) of the next quarter under 30 % of the capacity: slots to offer to the projects that could move their tests forward.')}>
              {[...gapsBy].map(([subject, xs]) => (
                <div key={subject} className={s.gapRow}><span>{subject}</span><span className="text-muted">{ranges(xs.map((g) => g.monday)).map(([a, b]) => (a === b ? weekLabel(a) : `${weekLabel(a)} → ${weekLabel(b)}`)).join(', ')}</span></div>
              ))}
            </SectionCard>
          )}
        </div>
      </div>

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
