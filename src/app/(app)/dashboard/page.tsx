// Utilisation dashboard (docs/spec/02 §6, P-5): over a period, per resource and per facility, the net open hours and the
// booked, realised, realised-with-preparation and blocked rates; waiting from request to test per entity; bookings not held;
// days used against the quotas of the agreements this month (A-3); late requests per entity (F-5, delivery 3). Computed from the bookings and calendars, never stored.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KpiGrid, KpiTile } from '@/components/app/Kpi';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Table, Td, Th } from '@/components/ds/Table';
import { canSee } from '@/config/screens';
import { DEFAULT_HOURS, addMonthsIso, openWindows } from '@/domain/calendar';
import { isIsoDate } from '@/domain/clock';
import { DEFAULT_NOTICE_WORKDAYS, isLateRequest } from '@/domain/needs';
import { daysUsed, rateOf, resourceUsage, waitingByEntity, type ResourceUsage } from '@/domain/utilisation';
import { dataText } from '@/i18n/data-text';
import { addDaysIso, parisParts } from '@/lib/dates';
import { fmtDate } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { usageFacts } from '@/server/dal/resources';
import { getI18n, getViewer } from '@/server/session';

const pct = (v: number | null, lang: 'fr' | 'en') => (v == null ? '—' : `${v.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')} %`);
const h = (v: number) => `${Math.round(v * 10) / 10} h`;

function sum(xs: ResourceUsage[]): ResourceUsage {
  return xs.reduce((a, x) => ({
    openHours: a.openHours + x.openHours, netOpenHours: a.netOpenHours + x.netOpenHours, bookedHours: a.bookedHours + x.bookedHours,
    realisedHours: a.realisedHours + x.realisedHours, realisedWithPrepHours: a.realisedWithPrepHours + x.realisedWithPrepHours,
    blockedHours: a.blockedHours + x.blockedHours, noShows: a.noShows + x.noShows,
  }), { openHours: 0, netOpenHours: 0, bookedHours: 0, realisedHours: 0, realisedWithPrepHours: 0, blockedHours: 0, noShows: 0 });
}

export default async function DashboardPage({ searchParams }: PageProps<'/dashboard'>) {
  const [{ t, lang }, viewer, today, sp] = await Promise.all([getI18n(), getViewer(), businessToday(), searchParams]);
  if (!canSee(viewer.role, 'dashboard')) notFound();
  const to = typeof sp.to === 'string' && isIsoDate(sp.to) ? sp.to : today;
  const from = typeof sp.from === 'string' && isIsoDate(sp.from) && sp.from < to ? sp.from : addDaysIso(to, -28);
  const monthStart = `${today.slice(0, 8)}01`;
  const f = await usageFacts(viewer, from, to, { fromIso: monthStart, toIso: addMonthsIso(monthStart, 1) });
  const usage = new Map(f.resources.map((r) => {
    const cal = f.calendars.get(r.facilityCode)!;
    return [r.id, resourceUsage({
      resourceId: r.id, period: f.period, open: openWindows(cal.hours.length ? cal.hours : DEFAULT_HOURS, cal.closures, from, to),
      unavailable: f.unavailabilities.filter((u) => u.resourceId === r.id), bookings: f.bookings, rules: f.rules,
    })];
  }));
  const isoOf = (ms: number) => parisParts(new Date(ms)).iso;
  const noticeOf = (facilityCode: string, entityCode: string) => f.agreements.find((a) => a.facilityCode === facilityCode && a.entityCode === entityCode)?.noticeWorkdays ?? DEFAULT_NOTICE_WORKDAYS;
  // Imported history (F-9) carries no request date of its own: never counted late.
  const waiting = waitingByEntity(f.bookings.map((b) => ({ ...b, late: b.source === 'crucible' && isLateRequest(isoOf(b.requestedAt), isoOf(b.start), noticeOf(b.facilityCode, b.entityCode)) })));
  const presets: [string, string, string][] = [['Last 4 weeks', addDaysIso(today, -28), today], ['Last 13 weeks', addDaysIso(today, -91), today], ['This month', monthStart, today]];

  return (
    <>
      <PageHeader screen="dashboard" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', fontSize: 13 }}>
        <strong>{fmtDate(from, lang)} → {fmtDate(addDaysIso(to, -1), lang)}</strong>
        {presets.map(([label, a, b]) => (
          <Link key={label} href={`/dashboard?from=${a}&to=${b}`}>{t(label)}</Link>
        ))}
      </div>
      <KpiGrid min={170}>
        {f.facilities.map((fac) => {
          const u = sum(f.resources.filter((r) => r.facilityCode === fac.code).map((r) => usage.get(r.id)!));
          return (
            <KpiTile key={fac.code} label={dataText(fac.name, lang)} value={pct(rateOf(u.realisedWithPrepHours, u.netOpenHours), lang)}
              sub={`${t('realised with preparation')} · ${t('booked')} ${pct(rateOf(u.bookedHours, u.netOpenHours), lang)} · ${t('blocked')} ${pct(rateOf(u.blockedHours, u.netOpenHours), lang)}`} size="lg" />
          );
        })}
      </KpiGrid>

      <SectionCard title={t('Utilisation by resource')} subtitle={t('Rates over the net open hours (opening hours minus unavailabilities). Realised = actual test time without preparation; blocked = free but forbidden by a validated exclusion rule.')} scroll>
        {f.resources.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Resource')}</Th>
                <Th align="right">{t('Net open hours')}</Th>
                <Th align="right">{t('Booked')}</Th>
                <Th align="right">{t('Realised')}</Th>
                <Th align="right">{t('Realised with preparation')}</Th>
                <Th align="right">{t('Blocked by a rule')}</Th>
                <Th align="right">{t('Not held')}</Th>
              </tr>
            </thead>
            <tbody>
              {f.resources.map((r) => {
                const u = usage.get(r.id)!;
                return (
                  <tr key={r.id}>
                    <Td>{r.code}<div className="text-muted">{dataText(r.name, lang)}</div></Td>
                    <Td align="right" numeric>{h(u.netOpenHours)}</Td>
                    <Td align="right" numeric>{pct(rateOf(u.bookedHours, u.netOpenHours), lang)}</Td>
                    <Td align="right" numeric>{pct(rateOf(u.realisedHours, u.netOpenHours), lang)}</Td>
                    <Td align="right" numeric>{pct(rateOf(u.realisedWithPrepHours, u.netOpenHours), lang)}</Td>
                    <Td align="right" numeric>{pct(rateOf(u.blockedHours, u.netOpenHours), lang)}</Td>
                    <Td align="right" numeric>{u.noShows}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No resource in your scope.')}</EmptyState>
        )}
      </SectionCard>

      <SectionCard title={t('Waiting from request to test')} subtitle={t('Calendar days between the request and the start of the test, for the confirmed, started and done bookings starting in the period. Late: requested less than 10 working days before (F-5).')} scroll>
        {waiting.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Entity')}</Th>
                <Th align="right">{t('Bookings')}</Th>
                <Th align="right">{t('Average (days)')}</Th>
                <Th align="right">{t('Longest (days)')}</Th>
                <Th align="right">{t('Late requests')}</Th>
              </tr>
            </thead>
            <tbody>
              {waiting.map((w) => (
                <tr key={w.entityCode}>
                  <Td>{w.entityCode}</Td>
                  <Td align="right" numeric>{w.count}</Td>
                  <Td align="right" numeric>{w.averageDays.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}</Td>
                  <Td align="right" numeric>{w.maxDays.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}</Td>
                  <Td align="right" numeric>{w.late}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No booking in the period.')}</EmptyState>
        )}
      </SectionCard>

      {f.agreements.length > 0 && (
        <SectionCard title={t('Quotas of the agreements this month')}>
          {f.agreements.map((a) => {
            const used = daysUsed(f.monthBookings.filter((b) => b.facilityCode === a.facilityCode && b.entityCode === a.entityCode), isoOf);
            return (
              <span key={`${a.facilityCode}-${a.entityCode}`} className="text-muted">
                {a.facilityCode} · {a.entityCode} : {used} / {a.quotaDaysPerMonth ?? '—'} {t('days used, booked or done')}
              </span>
            );
          })}
        </SectionCard>
      )}
    </>
  );
}
