// Resource planning (docs/spec/05 "Planning des moyens"): the week of every resource the viewer sees, by half-day — held,
// requested, blocked by a validated exclusion rule (P-2: one zone of the PDE at a time), unavailable or closed —, the bookings
// of the week with the actions the viewer may take, the request form, and the history import for the coordinator (F-9).
// What a booking is for is shown only to those who may see its project (U-3). Delivery 5b (Keystone's layout): the facility
// filter and the week navigation under the header, the request and the history import in side panels, the week's figures, and
// a warning for a request that a validated exclusion rule will refuse at confirmation.
import { Warning } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Folded } from '@/components/app/ActionForm';
import { EmptyState } from '@/components/app/EmptyState';
import { KpiGrid, KpiTile } from '@/components/app/Kpi';
import { PeriodNav } from '@/components/app/PeriodNav';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Segmented } from '@/components/ds/Segmented';
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
import { openNeedsOf } from '@/server/dal/needs';
import { visibleProjects } from '@/server/dal/visibility';
import { getI18n, getViewer } from '@/server/session';
import s from './planning.module.css';

const STATE_CLASS: Record<CellState, string> = { closed: s.closed, unavailable: s.unavailable, held: s.held, blocked: s.blocked, free: s.free };

export default async function PlanningPage({ searchParams }: PageProps<'/planning'>) {
  const [{ t, lang }, viewer, today, sp] = await Promise.all([getI18n(), getViewer(), businessToday(), searchParams]);
  if (!canSee(viewer.role, 'planning')) notFound();
  const asked = typeof sp.week === 'string' && isIsoDate(sp.week) ? sp.week : today;
  const monday = mondayOf(asked);
  const all = await planningWeek(viewer, monday);
  const only = typeof sp.facility === 'string' && all.facilities.some((f) => f.code === sp.facility) ? sp.facility : null;
  const week = only ? { ...all, facilities: all.facilities.filter((f) => f.code === only), resources: all.resources.filter((r) => r.facilityCode === only), plan: all.plan.filter((b) => b.facilityCode === only) } : all;
  const href = (o: { week?: string; facility?: string | null }) => {
    const q = new URLSearchParams();
    const w = o.week ?? monday;
    if (w !== mondayOf(today)) q.set('week', w);
    const f = o.facility === undefined ? only : o.facility;
    if (f) q.set('facility', f);
    const qs = q.toString();
    return `/planning${qs ? `?${qs}` : ''}`;
  };
  const days = Array.from({ length: 5 }, (_, i) => addDaysIso(monday, i));
  const grid = weekGrid({ monday, resources: week.resources, calendars: week.calendars, bookings: week.plan, unavailabilities: week.unavailabilities, rules: week.rules });
  const byId = new Map(week.plan.map((b) => [b.id, b]));
  const resCode = new Map(week.resources.map((r) => [r.id, r]));
  const mine = managedFacilities(viewer.role, viewer.assignments);
  const choices = bookingChoices(viewer, await visibleProjects(viewer), week.facilities);
  const bookable = week.resources.filter((r) => choices.facilityCodes.includes(r.facilityCode) && r.status === 'in_service');
  const needs = await openNeedsOf(choices.projects.map((p) => p.code));
  const what = (b: PlanBooking) => (b.projectCode ? `${b.projectCode} · ${dataText(b.title ?? '', lang)}` : b.confidential ? t('Booked (confidential)') : `${t('Booked')} · ${b.entityCode}`);
  const short = (b: PlanBooking) => b.projectCode ?? (b.confidential ? t('Confidential') : b.entityCode);
  const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const cells = [...grid.values()].flat();
  const blockedHalves = cells.filter((c) => c.state === 'blocked').length;
  const unavailableHalves = cells.filter((c) => c.state === 'unavailable').length;
  const requested = week.plan.filter((b) => b.status === 'requested');
  // A request on a half-day a validated rule blocks will be refused at confirmation: say so now.
  const refused = requested.flatMap((b) => {
    const c = (grid.get(b.resourceId) ?? []).find((x) => x.state === 'blocked' && x.bookingIds.includes(b.id));
    return c ? [{ b, rule: c.reason?.split(' · ')[0] ?? '' }] : [];
  });
  const counts = new Map<string, number>();
  for (const r of all.resources) counts.set(r.facilityCode, (counts.get(r.facilityCode) ?? 0) + 1);
  const canRequest = bookable.length > 0 && choices.projects.length > 0;

  return (
    <>
      <PageHeader
        screen="planning"
        crumbs={['Planning']}
        toolbar={
          <>
            {all.facilities.length > 1 && (
              <Segmented
                label={t('Facility')}
                value={only ?? 'all'}
                options={[
                  { value: 'all', label: t('All'), count: all.resources.length, href: href({ facility: null }) },
                  ...all.facilities.map((f) => ({ value: f.code, label: dataText(f.name, lang), count: counts.get(f.code) ?? 0, href: href({ facility: f.code }) })),
                ]}
              />
            )}
            <PeriodNav
              back={{ href: href({ week: addDaysIso(monday, -7) }), label: t('Previous week') }}
              current={monday !== mondayOf(today) ? { href: href({ week: mondayOf(today) }), label: t('This week') } : null}
              forward={{ href: href({ week: addDaysIso(monday, 7) }), label: t('Next week') }}
              period={`${fmtDate(monday, lang)} → ${fmtDate(addDaysIso(monday, 4), lang)}`}
            />
          </>
        }
        primary={
          <>
            {viewer.role === 'coordinator' && (
              <Folded summary="Import the history" size="md">
                <p className="text-muted">{t('Past bookings of your facilities, for the reference measure of the utilisation (F-9).')}</p>
                <ImportHistoryForm />
              </Folded>
            )}
            {canRequest && (
              <Folded summary="Request a slot" variant="primary" size="md">
                <p className="text-muted">{t('Every hard constraint is checked: opening hours, unavailabilities, inspections, capacity, validated exclusion rules. A manager of the facility then confirms.')}</p>
                <RequestBookingForm resources={bookable.map((r) => ({ id: r.id, code: r.code, name: dataText(r.name, lang), granularity: r.granularity }))} projects={choices.projects.map((p) => ({ code: p.code, name: dataText(p.name, lang) }))} today={today}
                  needs={needs.map((n) => ({ ...n, title: dataText(n.title, lang) }))} />
              </Folded>
            )}
          </>
        }
      />

      <KpiGrid min={190}>
        <KpiTile label={t('Bookings of the week')} value={week.plan.length} size="lg" sub={`${week.plan.length - requested.length} ${t('held')} · ${requested.length} ${t('requested')}`} />
        <KpiTile label={t('Requests to confirm')} value={requested.length} size="lg" sub={refused.length ? `${refused.length} ${t('refused by a rule at confirmation')}` : t('None refused by a rule')} />
        <KpiTile label={t('Blocked by a rule')} value={blockedHalves} size="lg" sub={t('free half-days a validated rule forbids')} />
        <KpiTile label={t('Unavailable')} value={unavailableHalves} size="lg" sub={t('half-days: breakdowns, maintenance, inspections')} />
      </KpiGrid>

      {refused.map(({ b, rule }) => (
        <div key={b.id} className={s.warning} role="note">
          <Warning size={18} className={s.warnIcon} />
          <span className={s.warnText}>
            <strong>{b.ref}</strong> · {b.resourceCode} · {fmtSlot(b.start, b.end, lang)} — {t('this request overlaps a half-day blocked by a validated exclusion rule: it will be refused at confirmation')} ({rule}).
          </span>
        </div>
      ))}

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

    </>
  );
}
