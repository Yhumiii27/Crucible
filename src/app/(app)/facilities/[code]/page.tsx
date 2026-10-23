// Facility sheet (docs/spec/05 "Fiche moyen"): its resources, opening hours and closures, unavailabilities, periodic
// inspections (R-6), the exclusion rules that concern it, its mobile equipment (R-8) and its sharing agreements. A facility outside the viewer's
// visibility does not exist (404). The facility's managers (coordinator, facility manager) edit it here. Delivery 5b (Keystone's
// project sheet): the tabs of the sidebar's Facility section (`?tab=`), the tab's actions in the header opening side panels, the
// next step when an inspection is due.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Folded } from '@/components/app/ActionForm';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Tag } from '@/components/ds/Tag';
import { Table, Td, Th } from '@/components/ds/Table';
import { FACILITY_TABS, FACILITY_TAB_LABEL, facilityTabHref, isFacilityTab } from '@/config/facility-tabs';
import { canSee } from '@/config/screens';
import { GRANULARITY_LABEL, RESOURCE_KIND_LABEL, RESOURCE_STATUS_LABEL, RULE_STATUS_LABEL, UNAVAILABILITY_KIND_LABEL } from '@/domain/resources';
import { managedFacilities } from '@/domain/rights';
import {
  AcquisitionForm, ClosureForm, HoursForm, InspectionForm, NewResourceForm, RemoveUnavailabilityButton, ResourceStatusSelect, UnavailabilityForm,
} from '@/features/resources/forms';
import { EquipmentForm } from '@/features/planning/forms';
import { dataText } from '@/i18n/data-text';
import { addDaysIso } from '@/lib/dates';
import { fmtDate } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { facilityEquipment } from '@/server/dal/planning';
import { facilitySheet } from '@/server/dal/resources';
import { getI18n, getViewer } from '@/server/session';
import st from './facility.module.css';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default async function FacilityPage({ params, searchParams }: PageProps<'/facilities/[code]'>) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const [{ t, lang }, viewer, today] = await Promise.all([getI18n(), getViewer(), businessToday()]);
  if (!canSee(viewer.role, 'facility')) notFound();
  const sheet = await facilitySheet(viewer, decodeURIComponent(code), today);
  if (!sheet) notFound();
  const { facility } = sheet;
  const tab = isFacilityTab(sp.tab) ? sp.tab : 'resources';
  const equipment = await facilityEquipment(viewer, facility.code);
  const manager = managedFacilities(viewer.role, viewer.assignments).includes(facility.code);
  const resRefs = sheet.resources.filter((r) => r.status !== 'retired').map((r) => ({ id: r.id, code: r.code }));
  const inService = sheet.resources.filter((r) => r.status === 'in_service').length;
  const validated = sheet.rules.filter((r) => r.status === 'validated');
  // Next step: the earliest inspection overdue or due within 30 days (R-10: a slot ending after it is refused).
  const dueSoon = [...sheet.inspections].filter((i) => i.dueOn <= addDaysIso(today, 30)).sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0] ?? null;
  const unavailableNow = sheet.unavailabilities.filter((u) => u.endsAt > new Date()).length;
  const badge: Partial<Record<string, number>> = { inspections: sheet.inspections.filter((i) => i.dueOn <= addDaysIso(today, 30)).length, equipment: equipment.length, calendar: unavailableNow };

  const primary = (
    <>
      {tab === 'resources' && viewer.role === 'rd_director' && (
        <Folded summary="Change the acquisition cost" size="md">
          <p className="text-muted">{t('Base of the value of the unused capacity in the steering (P-8).')}</p>
          <AcquisitionForm facilityCode={facility.code} value={facility.acquisitionKeur} />
        </Folded>
      )}
      {tab === 'resources' && manager && (
        <Folded summary="Add a resource" variant="primary" size="md"><NewResourceForm facilityCode={facility.code} /></Folded>
      )}
      {tab === 'calendar' && manager && (
        <>
          <Folded summary="Change the opening hours" size="md"><HoursForm facilityCode={facility.code} hours={sheet.hours} /></Folded>
          <Folded summary="Add a closure" size="md"><ClosureForm facilityCode={facility.code} /></Folded>
          {resRefs.length > 0 && <Folded summary="Add an unavailability" variant="primary" size="md"><UnavailabilityForm resources={resRefs} /></Folded>}
        </>
      )}
      {tab === 'inspections' && manager && resRefs.length > 0 && (
        <Folded summary="Record an inspection" variant="primary" size="md"><InspectionForm resources={resRefs} today={today} /></Folded>
      )}
      {tab === 'equipment' && manager && (
        <Folded summary="Add mobile equipment" variant="primary" size="md"><EquipmentForm facilityCode={facility.code} /></Folded>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        screen="facility"
        title={dataText(facility.name, lang)}
        crumbs={['Facilities']}
        crumbData={facility.code}
        aside={
          <span className={st.tags}>
            <Tag tone="accent" size="sm">{`${inService} ${t('in service')}`}</Tag>
            {validated.map((r) => <Tag key={r.id} tone="outline" size="sm">{`${r.code} · ${t('validated')}`}</Tag>)}
            {facility.acquisitionKeur != null && <Tag tone="neutral" size="sm">{`${t('Acquisition')} ${facility.acquisitionKeur.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')} k€`}</Tag>}
          </span>
        }
        primary={primary}
      />
      <div className={st.meta}>{[facility.operatorName, dataText(facility.siteName, lang), facility.partnerEntityCodes.length ? `${t('shared with')} ${facility.partnerEntityCodes.join(', ')}` : null].filter(Boolean).join(' · ')}</div>

      {dueSoon && (
        <div className={st.next}>
          <span className={st.nextText}>
            <strong>{t('Next step:')}</strong> {t('record the inspection')} « {dataText(dueSoon.label, lang)} » {t('of')} {dueSoon.resourceCode} ({t('due')} {fmtDate(dueSoon.dueOn, lang)}). {t('Until then, no slot of this resource can end after that date.')}
          </span>
          {tab !== 'inspections' && <Link className="btn btn-secondary" href={facilityTabHref(facility.code, 'inspections')}>{t('Periodic inspections')}</Link>}
        </div>
      )}

      <nav className={st.tabs} aria-label={t('Sections of the facility')}>
        {FACILITY_TABS.map((x) => (
          <Link key={x} href={facilityTabHref(facility.code, x)} className={x === tab ? `${st.tab} ${st.tabOn}` : st.tab} aria-current={x === tab ? 'page' : undefined} scroll={false}>
            {t(FACILITY_TAB_LABEL[x])}
            {!!badge[x] && <span className={st.tabBadge}>{badge[x]}</span>}
          </Link>
        ))}
      </nav>

      {tab === 'resources' && (
        <div className={st.layout}>
          <SectionCard title={t('Resources')} hint={String(sheet.resources.length)} subtitle={facility.description ? dataText(facility.description, lang) : undefined} scroll flex="999 1 620px">
            {sheet.resources.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>{t('Resource')}</Th>
                    <Th>{t('Kind')}</Th>
                    <Th>{t('Booked by')}</Th>
                    <Th align="right">{t('Capacity')}</Th>
                    <Th align="right">{t('Preparation · restoring (min)')}</Th>
                    <Th>{t('Status')}</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {sheet.resources.map((r) => (
                    <tr key={r.id}>
                      <Td><div className={st.cell}><span>{r.code}</span><span className={st.cellSub}>{dataText(r.name, lang)}</span></div></Td>
                      <Td>{t(RESOURCE_KIND_LABEL[r.kind])}</Td>
                      <Td>{t(GRANULARITY_LABEL[r.granularity])}</Td>
                      <Td align="right" numeric>{r.capacity}</Td>
                      <Td align="right" numeric>{r.setupMinutes} · {r.teardownMinutes}</Td>
                      <Td>{manager ? <ResourceStatusSelect resourceId={r.id} status={r.status} /> : t(RESOURCE_STATUS_LABEL[r.status])}</Td>
                      <Td align="right"><Link href={`/planning?facility=${encodeURIComponent(facility.code)}`}>{t('Planning')}</Link></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState>{t('No resource yet.')}</EmptyState>
            )}
          </SectionCard>
          <div className={st.side}>
            <SectionCard title={t('Exclusion rules')} subtitle={t('Resources that cannot work at the same time; a rule applies once the safety officer validates it.')}>
              {sheet.rules.length ? (
                sheet.rules.map((r) => (
                  <div key={r.id} className={st.rule}>
                    <span><strong>{r.code}</strong> · {dataText(r.label, lang)} <Tag tone={r.status === 'validated' ? 'accent' : r.status === 'proposed' ? 'outline' : 'neutral'} size="xs">{t(RULE_STATUS_LABEL[r.status])}</Tag></span>
                    <span className="text-muted">{r.resourceCodes.join(', ')} · {t('at most')} {r.maxActive}</span>
                  </div>
                ))
              ) : (
                <EmptyState>{t('No exclusion rule.')}</EmptyState>
              )}
              <Link href="/rules">{t('All rules')}</Link>
            </SectionCard>
            <SectionCard title={t('Opening hours')}>
              <span className="text-muted">{sheet.hours.length ? sheet.hours.map((h) => `${t(WEEKDAYS[h.weekday - 1])} ${h.opensAt}–${h.closesAt}`).join(' · ') : t('No opening hours: the default hours apply (Monday–Friday, 07:00–17:00).')}</span>
              {sheet.closures.length > 0 && <span className="text-muted">{`${t('Closures')} : ${sheet.closures.map((c) => `${fmtDate(c.fromOn, lang)}${c.toOn !== c.fromOn ? ` → ${fmtDate(c.toOn, lang)}` : ''} (${dataText(c.label, lang)})`).join(' · ')}`}</span>}
              <Link href={facilityTabHref(facility.code, 'calendar')}>{t('Calendar & unavailabilities')}</Link>
            </SectionCard>
            {sheet.agreements.length > 0 && (
              <SectionCard title={t('Sharing agreements')}>
                {sheet.agreements.map((a) => (
                  <span key={a.entityCode} className="text-muted">
                    {dataText(a.entityName, lang)} · {a.quotaDaysPerMonth != null ? `${t('quota')} ${a.quotaDaysPerMonth} ${t('days per month')}` : t('no quota')} · {t('notice')} {a.noticeWorkdays} {t('working days')}
                  </span>
                ))}
              </SectionCard>
            )}
          </div>
        </div>
      )}

      {tab === 'calendar' && (
        <>
          <SectionCard title={t('Opening hours')} subtitle={sheet.closures.length ? `${t('Closures')} : ${sheet.closures.map((c) => `${fmtDate(c.fromOn, lang)}${c.toOn !== c.fromOn ? ` → ${fmtDate(c.toOn, lang)}` : ''} (${dataText(c.label, lang)})`).join(' · ')}` : undefined}>
            <span className="text-muted">{sheet.hours.length ? sheet.hours.map((h) => `${t(WEEKDAYS[h.weekday - 1])} ${h.opensAt}–${h.closesAt}`).join(' · ') : t('No opening hours: the default hours apply (Monday–Friday, 07:00–17:00).')}</span>
          </SectionCard>
          <SectionCard title={t('Unavailabilities')} hint={String(sheet.unavailabilities.length)} scroll>
            {sheet.unavailabilities.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>{t('Resource')}</Th>
                    <Th>{t('Kind')}</Th>
                    <Th>{t('Description')}</Th>
                    <Th>{t('From')}</Th>
                    <Th>{t('To')}</Th>
                    {manager && <Th />}
                  </tr>
                </thead>
                <tbody>
                  {sheet.unavailabilities.map((u) => (
                    <tr key={u.id}>
                      <Td>{u.resourceCode}</Td>
                      <Td>{t(UNAVAILABILITY_KIND_LABEL[u.kind])}</Td>
                      <Td>{dataText(u.label, lang)}</Td>
                      <Td>{fmtDate(u.startsAt, lang)}</Td>
                      <Td>{fmtDate(new Date(u.endsAt.getTime() - 1), lang)}</Td>
                      {manager && <Td><RemoveUnavailabilityButton id={u.id} /></Td>}
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState>{t('No unavailability in the last 30 days or ahead.')}</EmptyState>
            )}
          </SectionCard>
        </>
      )}

      {tab === 'inspections' && (
        <SectionCard title={t('Periodic inspections')} subtitle={t('An inspection due before the end of a slot blocks the booking until the new inspection is recorded.')} scroll>
          {sheet.inspections.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>{t('Resource')}</Th>
                  <Th>{t('Inspection')}</Th>
                  <Th>{t('Last inspection')}</Th>
                  <Th>{t('Due')}</Th>
                </tr>
              </thead>
              <tbody>
                {sheet.inspections.map((i) => (
                  <tr key={i.id}>
                    <Td>{i.resourceCode}</Td>
                    <Td>{dataText(i.label, lang)}</Td>
                    <Td>{fmtDate(i.lastOn, lang)}</Td>
                    <Td>
                      {fmtDate(i.dueOn, lang)}
                      {i.dueOn < today ? <Tag tone="accent" size="sm" style={{ marginLeft: 8 }}>{t('Overdue')}</Tag> : i.dueOn <= addDaysIso(today, 30) ? <Tag tone="outline" size="sm" style={{ marginLeft: 8 }}>{t('Due within 30 days')}</Tag> : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState>{t('No inspection recorded.')}</EmptyState>
          )}
        </SectionCard>
      )}

      {tab === 'equipment' && (
        <SectionCard title={t('Mobile equipment')} hint={String(equipment.length)} subtitle={t('Shared movable equipment kept by the facility: booked with the test that needs it (R-8).')} scroll>
          {equipment.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>{t('Code')}</Th>
                  <Th>{t('Name')}</Th>
                </tr>
              </thead>
              <tbody>
                {equipment.map((e) => (
                  <tr key={e.code}>
                    <Td>{e.code}</Td>
                    <Td>{dataText(e.name, lang)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState>{t('No mobile equipment.')}</EmptyState>
          )}
        </SectionCard>
      )}
    </>
  );
}
