// Facility sheet (docs/spec/05 "Fiche moyen"): its resources, opening hours and closures, unavailabilities, periodic
// inspections (R-6), the exclusion rules that concern it, its mobile equipment (R-8) and its sharing agreements. A facility outside the viewer's
// visibility does not exist (404). The facility's managers (coordinator, facility manager) edit it here.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Tag } from '@/components/ds/Tag';
import { Table, Td, Th } from '@/components/ds/Table';
import { canSee } from '@/config/screens';
import { GRANULARITY_LABEL, RESOURCE_KIND_LABEL, RESOURCE_STATUS_LABEL, RULE_STATUS_LABEL, UNAVAILABILITY_KIND_LABEL } from '@/domain/resources';
import { managedFacilities } from '@/domain/rights';
import {
  ClosureForm, HoursForm, InspectionForm, NewResourceForm, RemoveUnavailabilityButton, ResourceStatusSelect, UnavailabilityForm,
} from '@/features/resources/forms';
import { EquipmentForm } from '@/features/planning/forms';
import { dataText } from '@/i18n/data-text';
import { fmtDate } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { facilityEquipment } from '@/server/dal/planning';
import { facilitySheet } from '@/server/dal/resources';
import { getI18n, getViewer } from '@/server/session';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default async function FacilityPage({ params }: PageProps<'/facilities/[code]'>) {
  const { code } = await params;
  const [{ t, lang }, viewer, today] = await Promise.all([getI18n(), getViewer(), businessToday()]);
  if (!canSee(viewer.role, 'facility')) notFound();
  const sheet = await facilitySheet(viewer, decodeURIComponent(code), today);
  if (!sheet) notFound();
  const { facility } = sheet;
  const equipment = await facilityEquipment(viewer, facility.code);
  const manager = managedFacilities(viewer.role, viewer.assignments).includes(facility.code);
  const resRefs = sheet.resources.filter((r) => r.status !== 'retired').map((r) => ({ id: r.id, code: r.code }));
  return (
    <>
      <PageHeader screen="facility" title={dataText(facility.name, lang)} crumbs={['Facilities']} crumbData={facility.code} />
      <SectionCard title={t('Resources')} hint={String(sheet.resources.length)} subtitle={facility.description ? dataText(facility.description, lang) : undefined} scroll>
        {sheet.resources.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Code')}</Th>
                <Th>{t('Name')}</Th>
                <Th>{t('Kind')}</Th>
                <Th>{t('Booked by')}</Th>
                <Th align="right">{t('Capacity')}</Th>
                <Th align="right">{t('Preparation (min)')}</Th>
                <Th align="right">{t('Restoring (min)')}</Th>
                <Th>{t('Status')}</Th>
              </tr>
            </thead>
            <tbody>
              {sheet.resources.map((r) => (
                <tr key={r.id}>
                  <Td>{r.code}</Td>
                  <Td>{dataText(r.name, lang)}</Td>
                  <Td>{t(RESOURCE_KIND_LABEL[r.kind])}</Td>
                  <Td>{t(GRANULARITY_LABEL[r.granularity])}</Td>
                  <Td align="right" numeric>{r.capacity}</Td>
                  <Td align="right" numeric>{r.setupMinutes}</Td>
                  <Td align="right" numeric>{r.teardownMinutes}</Td>
                  <Td>{manager ? <ResourceStatusSelect resourceId={r.id} status={r.status} /> : t(RESOURCE_STATUS_LABEL[r.status])}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No resource yet.')}</EmptyState>
        )}
        {manager && <NewResourceForm facilityCode={facility.code} />}
      </SectionCard>

      <SectionCard title={t('Exclusion rules')} subtitle={t('Resources that cannot work at the same time; a rule applies once the safety officer validates it.')}>
        {sheet.rules.length ? (
          sheet.rules.map((r) => (
            <div key={r.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <strong>{r.code}</strong>
              <span>{dataText(r.label, lang)}</span>
              <span className="text-muted">{r.resourceCodes.join(', ')} · {t('at most')} {r.maxActive}</span>
              <Tag tone={r.status === 'validated' ? 'accent' : r.status === 'proposed' ? 'outline' : 'neutral'} size="sm">{t(RULE_STATUS_LABEL[r.status])}</Tag>
            </div>
          ))
        ) : (
          <EmptyState>{t('No exclusion rule.')}</EmptyState>
        )}
        <Link href="/rules">{t('All rules')}</Link>
      </SectionCard>

      <SectionCard title={t('Opening hours')} subtitle={sheet.closures.length ? `${t('Closures')} : ${sheet.closures.map((c) => `${fmtDate(c.fromOn, lang)}${c.toOn !== c.fromOn ? ` → ${fmtDate(c.toOn, lang)}` : ''} (${dataText(c.label, lang)})`).join(' · ')}` : undefined}>
        <span className="text-muted">
          {sheet.hours.length ? sheet.hours.map((h) => `${t(WEEKDAYS[h.weekday - 1])} ${h.opensAt}–${h.closesAt}`).join(' · ') : t('No opening hours: the default hours apply (Monday–Friday, 07:00–17:00).')}
        </span>
        {manager && <HoursForm facilityCode={facility.code} hours={sheet.hours} />}
        {manager && <ClosureForm facilityCode={facility.code} />}
      </SectionCard>

      <SectionCard title={t('Unavailabilities')} scroll>
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
        {manager && resRefs.length > 0 && <UnavailabilityForm resources={resRefs} />}
      </SectionCard>

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
                    {i.dueOn < today && <Tag tone="accent" size="sm" style={{ marginLeft: 8 }}>{t('Overdue')}</Tag>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No inspection recorded.')}</EmptyState>
        )}
        {manager && resRefs.length > 0 && <InspectionForm resources={resRefs} today={today} />}
      </SectionCard>

      <SectionCard title={t('Mobile equipment')} hint={String(equipment.length)} subtitle={t('Shared movable equipment kept by the facility: booked with the test that needs it (R-8).')}>
        {equipment.length ? (
          <span className="text-muted">{equipment.map((e) => `${e.code} · ${dataText(e.name, lang)}`).join(' — ')}</span>
        ) : (
          <EmptyState>{t('No mobile equipment.')}</EmptyState>
        )}
        {manager && <EquipmentForm facilityCode={facility.code} />}
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
    </>
  );
}
