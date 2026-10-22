// Resource planning (docs/spec/05 "Planning des moyens"): the week of every resource the viewer sees, by half-day — held,
// requested, blocked by a validated exclusion rule (P-2: one zone of the PDE at a time), unavailable or closed —, the bookings
// of the week with the actions the viewer may take, the request form, and the history import for the coordinator (F-9).
// What a booking is for is shown only to those who may see its project (U-3).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Tag } from '@/components/ds/Tag';
import { Table, Td, Th } from '@/components/ds/Table';
import { canSee } from '@/config/screens';
import { isIsoDate } from '@/domain/clock';
import { mondayOf } from '@/domain/calendar';
import { weekGrid, type CellState } from '@/domain/planning-grid';
import { BOOKING_STATUS_LABEL } from '@/domain/resources';
import { managedFacilities } from '@/domain/rights';
import { CancelBookingForm, ConfirmBookingButton, ImportHistoryForm, RequestBookingForm } from '@/features/resources/forms';
import { dataText } from '@/i18n/data-text';
import { addDaysIso } from '@/lib/dates';
import { fmtDate, fmtSlot, fmtTime } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { bookingChoices, planningWeek, type PlanBooking } from '@/server/dal/resources';
import { visibleProjects } from '@/server/dal/visibility';
import { getI18n, getViewer } from '@/server/session';
import s from './planning.module.css';

const STATE_CLASS: Record<CellState, string> = { closed: s.closed, unavailable: s.unavailable, held: s.held, blocked: s.blocked, free: s.free };

export default async function PlanningPage({ searchParams }: PageProps<'/planning'>) {
  const [{ t, lang }, viewer, today, sp] = await Promise.all([getI18n(), getViewer(), businessToday(), searchParams]);
  if (!canSee(viewer.role, 'planning')) notFound();
  const asked = typeof sp.week === 'string' && isIsoDate(sp.week) ? sp.week : today;
  const monday = mondayOf(asked);
  const week = await planningWeek(viewer, monday);
  const days = Array.from({ length: 5 }, (_, i) => addDaysIso(monday, i));
  const grid = weekGrid({ monday, resources: week.resources, calendars: week.calendars, bookings: week.plan, unavailabilities: week.unavailabilities, rules: week.rules });
  const byId = new Map(week.plan.map((b) => [b.id, b]));
  const resCode = new Map(week.resources.map((r) => [r.id, r]));
  const mine = managedFacilities(viewer.role, viewer.assignments);
  const choices = bookingChoices(viewer, await visibleProjects(viewer), week.facilities);
  const bookable = week.resources.filter((r) => choices.facilityCodes.includes(r.facilityCode) && r.status === 'in_service');
  const what = (b: PlanBooking) => (b.projectCode ? `${b.projectCode} · ${dataText(b.title ?? '', lang)}` : b.confidential ? t('Booked (confidential)') : `${t('Booked')} · ${b.entityCode}`);
  const short = (b: PlanBooking) => b.projectCode ?? (b.confidential ? t('Confidential') : b.entityCode);
  const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'short', day: '2-digit', month: '2-digit' });

  return (
    <>
      <PageHeader screen="planning" />
      <div className={s.nav}>
        <Link href={`/planning?week=${addDaysIso(monday, -7)}`}>← {t('Previous week')}</Link>
        <strong>{t('Week of')} {fmtDate(monday, lang)}</strong>
        <Link href={`/planning?week=${addDaysIso(monday, 7)}`}>{t('Next week')} →</Link>
        {monday !== mondayOf(today) && <Link href="/planning">{t('This week')}</Link>}
      </div>

      <SectionCard title={t('Resources by half-day')} actions={
        <div className={s.legend}>
          <span><i className={`${s.swatch} ${s.held}`} />{t('Booked')}</span>
          <span><i className={`${s.swatch} ${s.request}`} />{t('Requested')}</span>
          <span><i className={`${s.swatch} ${s.blocked}`} />{t('Blocked by a rule')}</span>
          <span><i className={`${s.swatch} ${s.unavailable}`} />{t('Unavailable')}</span>
          <span><i className={`${s.swatch} ${s.closed}`} />{t('Closed')}</span>
        </div>
      }>
        {week.resources.length ? (
          <div className={s.scroll}>
            <table className={s.grid}>
              <thead>
                <tr>
                  <th>{t('Resource')}</th>
                  {days.map((d) => (
                    <th key={d} colSpan={2}>{dayLabel(d)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {week.facilities.map((f) => {
                  const rows = week.resources.filter((r) => r.facilityCode === f.code);
                  if (!rows.length) return null;
                  return [
                    <tr key={f.code} className={s.facility}>
                      <th colSpan={11}><Link href={`/facilities/${encodeURIComponent(f.code)}`}>{dataText(f.name, lang)}</Link></th>
                    </tr>,
                    ...rows.map((r) => (
                      <tr key={r.id}>
                        <td className={s.res}>
                          {r.code}
                          <small>{dataText(r.name, lang)}</small>
                        </td>
                        {(grid.get(r.id) ?? []).map((c) => {
                          const bs = c.bookingIds.map((id) => byId.get(id)!).filter(Boolean);
                          const requestOnly = bs.length > 0 && bs.every((b) => b.status === 'requested');
                          const title = [c.reason, ...bs.map((b) => `${b.ref} · ${t(BOOKING_STATUS_LABEL[b.status])} · ${what(b)}`)].filter(Boolean).join('\n');
                          return (
                            <td key={`${c.day}-${c.half}`} className={`${s.cell} ${STATE_CLASS[c.state]} ${requestOnly ? s.request : ''}`} title={title || undefined}>
                              {bs.map((b) => (
                                <span key={b.id} className={s.chip}>
                                  {r.granularity === 'hour' ? `${fmtTime(b.start, lang)} ` : ''}
                                  {short(b)}
                                </span>
                              ))}
                              {!bs.length && c.state === 'blocked' && <span className={s.chip}>{c.reason?.split(' · ')[1]}</span>}
                              {!bs.length && c.state === 'unavailable' && <span className={s.chip}>{t('Unavailable')}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    )),
                  ];
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>{t('No resource in your scope.')}</EmptyState>
        )}
      </SectionCard>

      <SectionCard title={t('Bookings of the week')} hint={String(week.plan.length)} scroll>
        {week.plan.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Booking')}</Th>
                <Th>{t('Resource')}</Th>
                <Th>{t('Slot')}</Th>
                <Th>{t('Test')}</Th>
                <Th>{t('Status')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {week.plan.map((b) => {
                const manager = mine.includes(b.facilityCode);
                const requester = b.requestedByUserId === viewer.userId;
                const cancellable = (b.status === 'requested' || b.status === 'confirmed') && (manager || requester);
                return (
                  <tr key={b.id}>
                    <Td valign="top">{b.ref}</Td>
                    <Td valign="top">{resCode.get(b.resourceId)?.code ?? b.resourceCode}</Td>
                    <Td valign="top" nowrap>{fmtSlot(b.start, b.end, lang)}</Td>
                    <Td valign="top">
                      {what(b)}
                      {b.projectCode && b.requestedByName && <div className="text-muted">{t('Requested by')} {b.requestedByName}</div>}
                    </Td>
                    <Td valign="top">
                      <Tag tone={b.status === 'requested' ? 'outline' : b.status === 'confirmed' || b.status === 'in_progress' ? 'accent' : 'neutral'} size="sm">{t(BOOKING_STATUS_LABEL[b.status])}</Tag>
                    </Td>
                    <Td valign="top">
                      <div className={s.actions}>
                        {manager && b.status === 'requested' && <ConfirmBookingButton id={b.id} />}
                        {cancellable && <CancelBookingForm id={b.id} />}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No booking this week.')}</EmptyState>
        )}
      </SectionCard>

      {bookable.length > 0 && choices.projects.length > 0 && (
        <SectionCard title={t('Request a slot')} subtitle={t('Every hard constraint is checked: opening hours, unavailabilities, inspections, capacity, validated exclusion rules. A manager of the facility then confirms.')}>
          <RequestBookingForm resources={bookable.map((r) => ({ id: r.id, code: r.code, name: dataText(r.name, lang), granularity: r.granularity }))} projects={choices.projects.map((p) => ({ code: p.code, name: dataText(p.name, lang) }))} today={today} />
        </SectionCard>
      )}

      {viewer.role === 'coordinator' && (
        <SectionCard title={t('Import the history')} subtitle={t('Past bookings of your facilities, for the reference measure of the utilisation (F-9).')}>
          <ImportHistoryForm />
        </SectionCard>
      )}
    </>
  );
}
