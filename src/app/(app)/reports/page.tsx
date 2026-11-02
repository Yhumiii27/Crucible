// Monthly report (CR-077, X-16): for a month and the visible facilities (or one), the utilisation of each resource — net open
// hours, booked, realised with preparation, blocked, bookings not held — and the bookings of the month, masked as on the
// planning (U-3). Printed or saved as PDF from the browser (the shell is hidden in print); the header's Export gives the same
// lines as CSV or JSON for a BI tool. Computed at each read, never stored.
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/app/EmptyState';
import { PeriodNav } from '@/components/app/PeriodNav';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Segmented } from '@/components/ds/Segmented';
import { Table, Td, Th } from '@/components/ds/Table';
import { canSee } from '@/config/screens';
import { parseMonth, shiftMonth, type ReportLine } from '@/domain/report';
import { BOOKING_STATUS_LABEL } from '@/domain/resources';
import { PrintButton } from '@/features/report/print-button';
import { dataText } from '@/i18n/data-text';
import { fmtDate, fmtInstant, fmtSlot } from '@/lib/format';
import { businessNow, businessToday } from '@/server/clock';
import { monthlyReport } from '@/server/dal/report';
import { monthlyCharges } from '@/server/dal/charges';
import { euros } from '@/domain/charges';
import { getI18n, getViewer } from '@/server/session';

export default async function ReportPage({ searchParams }: PageProps<'/reports'>) {
  const [{ t, lang }, viewer, today, now, sp] = await Promise.all([getI18n(), getViewer(), businessToday(), businessNow(), searchParams]);
  if (!canSee(viewer.role, 'report')) notFound();
  const month = parseMonth(sp.month) ?? today.slice(0, 7);
  const facility = typeof sp.facility === 'string' ? sp.facility : null;
  // CR-074: the chargeback statement of the month, a second view of the report.
  const view = sp.view === 'charges' ? 'charges' : 'usage';
  const [data, charges] = await Promise.all([monthlyReport(viewer, month, facility), view === 'charges' ? monthlyCharges(viewer, month, facility) : null]);
  const href = (o: { month?: string; facility?: string | null; view?: string }) => {
    const q = new URLSearchParams({ month: o.month ?? month });
    const fac = o.facility === undefined ? facility : o.facility;
    if (fac) q.set('facility', fac);
    const v = o.view ?? view;
    if (v === 'charges') q.set('view', v);
    return `/reports?${q}`;
  };
  const eur = (cents: number | null) => (cents == null ? '—' : `${euros(cents).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  const pct = (v: number | null) => (v == null ? '—' : `${v.toLocaleString(locale)} %`);
  const hrs = (v: number) => `${v.toLocaleString(locale)} h`;
  const monthLabel = new Date(`${month}-15T12:00:00Z`).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { month: 'long', year: 'numeric' });
  const head = (
    <tr>
      <Th>{t('Resource')}</Th>
      <Th align="right">{t('Open hours')}</Th>
      <Th align="right">{t('Booked')}</Th>
      <Th align="right">{t('Realised')}</Th>
      <Th align="right">{t('Blocked')}</Th>
      <Th align="right">{t('Not held')}</Th>
    </tr>
  );
  const row = (l: ReportLine, label: string, strong = false) => (
    <tr key={label}>
      <Td>{strong ? <strong>{label}</strong> : label}</Td>
      <Td align="right" numeric>{hrs(l.netOpenHours)}</Td>
      <Td align="right" numeric>{hrs(l.bookedHours)} · {pct(l.bookedRate)}</Td>
      <Td align="right" numeric>{hrs(l.realisedHours)} · {pct(l.realisedRate)}</Td>
      <Td align="right" numeric>{hrs(l.blockedHours)} · {pct(l.blockedRate)}</Td>
      <Td align="right" numeric>{l.noShows}</Td>
    </tr>
  );

  return (
    <>
      <PageHeader screen="report" primary={<PrintButton />}
        toolbar={
          <>
            <PeriodNav back={{ href: href({ month: shiftMonth(month, -1) }), label: t('Previous month') }} forward={{ href: href({ month: shiftMonth(month, 1) }), label: t('Next month') }}
              current={month === today.slice(0, 7) ? null : { href: href({ month: today.slice(0, 7) }), label: t('This month') }} period={monthLabel} />
            <Segmented label={t('View')} value={view}
              options={[{ value: 'usage', label: t('Utilisation'), href: href({ view: 'usage' }) }, { value: 'charges', label: t('Chargeback'), href: href({ view: 'charges' }) }]} />
            {data.facilities.length > 1 && (
              <Segmented label={t('Facility')} value={facility ?? ''}
                options={[{ value: '', label: t('All'), href: href({ facility: null }) }, ...data.facilities.map((f) => ({ value: f.code, label: f.code, href: href({ facility: f.code }) }))]} />
            )}
          </>
        } />
      <p className="text-muted" style={{ margin: 0 }}>
        {t(view === 'charges' ? 'Chargeback statement' : 'Monthly report')} · {monthLabel} · {facility ? data.byFacility.map((f) => dataText(f.name, lang)).join(', ') : t('All facilities')} · {t('Generated on')} {fmtInstant(now, lang)}
      </p>
      {charges && (
        <>
          {charges.groups.length ? charges.groups.map((g) => (
            <SectionCard key={`${g.entityCode}|${g.projectCode ?? ''}`} title={`${g.entityCode} · ${g.projectCode ?? t('Projects not shown (confidential)')}`} hint={eur(g.amountCents)} scroll>
              <Table>
                <thead>
                  <tr>
                    <Th>{t('Booking')}</Th>
                    <Th>{t('Resource')}</Th>
                    <Th>{t('Day')}</Th>
                    <Th>{t('Status')}</Th>
                    <Th align="right">{t('Booked hours')}</Th>
                    <Th align="right">{t('Realised hours')}</Th>
                    <Th align="right">{t('Billed hours')}</Th>
                    <Th align="right">{t('Rate (€ per hour)')}</Th>
                    <Th align="right">{t('Amount')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {g.lines.map((l) => (
                    <tr key={l.bookingId}>
                      <Td>{l.ref}</Td>
                      <Td>{l.resourceCode}</Td>
                      <Td nowrap>{fmtDate(l.day, lang)}</Td>
                      <Td>{t(BOOKING_STATUS_LABEL[l.status as keyof typeof BOOKING_STATUS_LABEL] ?? l.status)}</Td>
                      <Td align="right" numeric>{hrs(l.bookedHours)}</Td>
                      <Td align="right" numeric>{hrs(l.realisedHours)}</Td>
                      <Td align="right" numeric>{hrs(l.billedHours)}</Td>
                      <Td align="right" numeric>{l.centsPerHour == null ? (l.billedHours > 0 ? t('No rate') : '—') : eur(l.centsPerHour)}</Td>
                      <Td align="right" numeric>{eur(l.amountCents)}</Td>
                    </tr>
                  ))}
                  <tr>
                    <Td><strong>{t('Total')}</strong></Td>
                    <Td /><Td /><Td />
                    <Td align="right" numeric>{hrs(g.bookedHours)}</Td>
                    <Td />
                    <Td align="right" numeric>{hrs(g.billedHours)}</Td>
                    <Td />
                    <Td align="right" numeric><strong>{eur(g.amountCents)}</strong></Td>
                  </tr>
                </tbody>
              </Table>
            </SectionCard>
          )) : <EmptyState>{t('Nothing to charge this month.')}</EmptyState>}
          {charges.groups.length > 0 && (
            <p style={{ margin: 0 }}>
              <strong>{t('Total of the month')} : {eur(charges.amountCents)}</strong>
              {charges.unrated > 0 && <span className="text-muted"> · {charges.unrated} {t('billed lines without a rate: set the rates of the facility first')}</span>}
            </p>
          )}
          <p className="text-muted" style={{ margin: 0, fontSize: 12 }}>
            {t('Hours billed: the realised time of a test done, the booked slot of a booking not held (X-19). The statement of the month is in the monthly report.')}
          </p>
        </>
      )}
      {view === 'usage' && (
        <>
      {data.byFacility.length ? (
        <>
          {data.byFacility.map((f) => (
            <SectionCard key={f.code} title={dataText(f.name, lang)} hint={f.code} scroll>
              <Table>
                <thead>{head}</thead>
                <tbody>
                  {f.lines.map((l) => row(l, l.code))}
                  {row(f.total, t('Total'), true)}
                </tbody>
              </Table>
            </SectionCard>
          ))}
          {data.byFacility.length > 1 && (
            <SectionCard title={t('All facilities')}>
              <Table><thead>{head}</thead><tbody>{row(data.total, t('Total'), true)}</tbody></Table>
            </SectionCard>
          )}
          <SectionCard title={t('Bookings of the month')} hint={String(data.bookings.length)} scroll>
            {data.bookings.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>{t('Booking')}</Th>
                    <Th>{t('Resource')}</Th>
                    <Th>{t('Slot')}</Th>
                    <Th>{t('Project')}</Th>
                    <Th>{t('Status')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.bookings.map((b) => (
                    <tr key={b.id}>
                      <Td>{b.ref}</Td>
                      <Td>{b.resourceCode}</Td>
                      <Td nowrap>{fmtSlot(b.start, b.end, lang)}</Td>
                      <Td>{b.projectCode ? `${b.projectCode}${b.title ? ` · ${dataText(b.title, lang)}` : ''}` : b.confidential ? t('Booked (confidential)') : `${t('Booked')} · ${b.entityCode}`}</Td>
                      <Td>{t(BOOKING_STATUS_LABEL[b.status])}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <EmptyState>{t('No booking this month.')}</EmptyState>}
          </SectionCard>
        </>
      ) : (
        <EmptyState>{t('No facility to report on.')}</EmptyState>
      )}
      <p className="text-muted" style={{ margin: 0, fontSize: 12 }}>
        {t('Rates over the net open hours of the month (opening hours less closures and unavailabilities); realised includes the preparation and restoring times.')}
      </p>
        </>
      )}
    </>
  );
}
