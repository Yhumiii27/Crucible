// My schedule (docs/spec/05 "Mon planning", X-1): the tests of the facilities I run, from yesterday to a week ahead — start
// a test, end it (now, or at the times typed when caught up at the end of the day), and, for a manager, release a confirmed
// booking not started two hours after its start (A-7); fill the facility's forms (CR-075: safety checklist before the start, test
// sheet, incident report). Laid out as a list so that it reads on a phone.
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Tag } from '@/components/ds/Tag';
import { canSee } from '@/config/screens';
import { canMarkNoShow } from '@/domain/booking';
import { BOOKING_STATUS_LABEL } from '@/domain/resources';
import { managedFacilities } from '@/domain/rights';
import { FillForm } from '@/features/forms/forms';
import { FinishBookingForm, NoShowButton, StartBookingButton } from '@/features/resources/forms';
import { dataText } from '@/i18n/data-text';
import { parisParts } from '@/lib/dates';
import { fmtDate, fmtSlot } from '@/lib/format';
import { businessNow, businessToday } from '@/server/clock';
import { bookingForms } from '@/server/dal/forms';
import { mySchedule } from '@/server/dal/resources';
import { getI18n, getViewer } from '@/server/session';

export default async function MySchedulePage() {
  const [{ t, lang }, viewer, today, now] = await Promise.all([getI18n(), getViewer(), businessToday(), businessNow()]);
  if (!canSee(viewer.role, 'my-schedule')) notFound();
  const rows = await mySchedule(viewer, today);
  const mine = managedFacilities(viewer.role, viewer.assignments);
  const days = [...new Set(rows.map((b) => parisParts(new Date(b.start)).iso))].sort();
  const forms = await bookingForms(rows.map((b) => b.id), [...new Set(rows.map((b) => b.facilityCode))]);
  // CR-075: the facility's safety checklist before the start, the test sheet from the start, incident reports while it runs.
  const formsOf = (b: (typeof rows)[number]) => {
    const before = forms.template(b.facilityCode, 'before');
    const after = forms.template(b.facilityCode, 'after');
    const incident = forms.template(b.facilityCode, 'incident');
    const open = b.status === 'confirmed' || b.status === 'in_progress';
    return (
      <>
        {before && open && (forms.filled(b.id, 'before') ? <Tag size="sm" tone="outline">{t('Safety checklist filled')}</Tag> : <FillForm bookingId={b.id} stage="before" items={before.items} />)}
        {after && (b.status === 'in_progress' || b.status === 'done') && (forms.filled(b.id, 'after') ? <Tag size="sm" tone="outline">{t('Test sheet filled')}</Tag> : <FillForm bookingId={b.id} stage="after" items={after.items} />)}
        {incident && b.status === 'in_progress' && <FillForm bookingId={b.id} stage="incident" items={incident.items} summary="Report an incident" />}
      </>
    );
  };
  return (
    <>
      <PageHeader screen="my-schedule" />
      {days.length ? (
        days.map((d) => (
          <SectionCard key={d} title={`${fmtDate(d, lang)}${d === today ? ` · ${t('Today')}` : ''}`}>
            {rows.filter((b) => parisParts(new Date(b.start)).iso === d).map((b) => (
              <div key={b.id} style={{ display: 'grid', gap: 4, padding: '6px 0', borderTop: '1px solid var(--color-neutral-800)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
                  <strong>{b.resourceCode}</strong>
                  <span>{fmtSlot(b.start, b.end, lang)}</span>
                  <Tag tone={b.status === 'in_progress' ? 'accent' : 'neutral'} size="sm">{t(BOOKING_STATUS_LABEL[b.status])}</Tag>
                  <span className="text-muted">{b.ref}</span>
                </div>
                <div>{b.projectCode ? `${b.projectCode} · ${dataText(b.title ?? '', lang)}` : b.confidential ? t('Booked (confidential)') : `${t('Booked')} · ${b.entityCode}`}</div>
                {b.operators && <div className="text-muted">{t('Operators')} : {b.operators}</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {formsOf(b)}
                  {b.status === 'confirmed' && <StartBookingButton id={b.id} />}
                  {(b.status === 'confirmed' || b.status === 'in_progress') && b.start <= now.getTime() && <FinishBookingForm id={b.id} />}
                  {mine.includes(b.facilityCode) && canMarkNoShow(b, now.getTime()) && <NoShowButton id={b.id} />}
                </div>
              </div>
            ))}
          </SectionCard>
        ))
      ) : (
        <EmptyState>{t('No test planned on your facilities this week.')}</EmptyState>
      )}
    </>
  );
}
