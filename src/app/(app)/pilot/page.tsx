// The pilot (docs/PLAN.md "Pilote", docs/PILOTE.md; decisions P-3, X-2, F-9): its state, set by the R&D director (first day,
// length, facilities); the checklist of its start computed from what is recorded; and the reference measure — the weeks
// before the start (the history imported) against the pilot so far, per facility of the pilot the viewer sees. Computed,
// never stored.
import { CheckCircle, Circle } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Folded } from '@/components/app/ActionForm';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Table, Td, Th } from '@/components/ds/Table';
import { Tag } from '@/components/ds/Tag';
import { canSee } from '@/config/screens';
import { endOfPilot, pilotStatus, pointsDelta, READINESS_LABEL, type ReadinessKey } from '@/domain/pilot';
import { PilotForm } from '@/features/pilot/forms';
import { dataText } from '@/i18n/data-text';
import { addDaysIso } from '@/lib/dates';
import { fmtDate } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { activeFacilities, pilotComparison, pilotReadiness, rates, readPilot, type PeriodMeasure } from '@/server/dal/pilot';
import { getI18n, getViewer } from '@/server/session';

/** Where each item of the checklist is settled. */
const FIX: Partial<Record<ReadinessKey, (code?: string) => string>> = {
  resources: (code) => (code ? `/facilities/${code}` : '/facilities'),
  rules: () => '/rules',
  inspections: (code) => (code ? `/facilities/${code}?tab=inspections` : '/facilities'),
  people: () => '/people',
  projects: () => '/projects',
  history: () => '/planning',
};

export default async function PilotPage() {
  const [{ t, lang }, viewer, today] = await Promise.all([getI18n(), getViewer(), businessToday()]);
  if (!canSee(viewer.role, 'pilot')) notFound();
  const [settings, facs] = await Promise.all([readPilot(), activeFacilities()]);
  const status = pilotStatus(settings, today);
  // Before it is set, the checklist runs on every active facility (P-3: the four facilities named).
  const scope = settings ?? { startOn: today, weeks: 4, baselineWeeks: 13, facilities: facs.map((f) => f.code) };
  const [ready, cmp] = await Promise.all([pilotReadiness(scope), settings ? pilotComparison(viewer, settings, today) : Promise.resolve(null)]);
  const pct = (v: number | null) => (v == null ? '—' : `${v.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')} %`);
  const pts = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')} ${t('pts')}`);
  const loc = (v: number) => v.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB');
  const num = (a: number | null, b: number | null) => (a == null || b == null ? '—' : `${b - a > 0 ? '+' : ''}${loc(Math.round((b - a) * 10) / 10)}`);
  const statusTag = status.kind === 'not_set' ? t('Not set')
    : status.kind === 'planned' ? `${t('Starts in')} ${status.daysLeft} ${t('days')}`
      : status.kind === 'running' ? `${t('Week')} ${status.week} / ${status.of}`
        : `${t('Ended on')} ${fmtDate(status.endOn, lang)}`;
  const rows = (m: PeriodMeasure | undefined, p: PeriodMeasure | undefined) => {
    const a = m ? rates(m) : null;
    const b = p ? rates(p) : null;
    return [
      { label: 'Realised with preparation', ref: pct(a?.realisedWithPrep ?? null), pilot: b ? pct(b.realisedWithPrep) : '—', delta: pts(pointsDelta(a?.realisedWithPrep ?? null, b?.realisedWithPrep ?? null)) },
      { label: 'Booked', ref: pct(a?.booked ?? null), pilot: b ? pct(b.booked) : '—', delta: pts(pointsDelta(a?.booked ?? null, b?.booked ?? null)) },
      { label: 'Blocked by a rule', ref: pct(a?.blocked ?? null), pilot: b ? pct(b.blocked) : '—', delta: pts(pointsDelta(a?.blocked ?? null, b?.blocked ?? null)) },
      { label: 'Bookings', ref: String(m?.bookings ?? '—'), pilot: p ? String(p.bookings) : '—', delta: num(m?.bookings ?? null, p?.bookings ?? null) },
      { label: 'Not held', ref: String(m?.usage.noShows ?? '—'), pilot: p ? String(p.usage.noShows) : '—', delta: num(m?.usage.noShows ?? null, p?.usage.noShows ?? null) },
      { label: 'Average wait (days)', ref: m?.averageWaitDays == null ? '—' : loc(m.averageWaitDays), pilot: p?.averageWaitDays == null ? '—' : loc(p.averageWaitDays), delta: num(m?.averageWaitDays ?? null, p?.averageWaitDays ?? null) },
      { label: 'Late requests', ref: String(m?.lateRequests ?? '—'), pilot: p ? String(p.lateRequests) : '—', delta: num(m?.lateRequests ?? null, p?.lateRequests ?? null) },
    ];
  };
  const missingCount = ready.filter((r) => !r.ok).length;

  return (
    <>
      <PageHeader screen="pilot" crumbs={['Steering']}
        aside={<Tag tone={status.kind === 'running' ? 'accent' : 'outline'} size="sm">{statusTag}</Tag>}
        primary={viewer.role === 'rd_director' ? (
          <Folded summary={settings ? 'Change the pilot' : 'Set the pilot'} variant="primary" size="md">
            <p className="text-muted">{t('Crucible becomes the reference of the bookings of the pilot facilities from the first day; the weeks before are the reference measure (X-2).')}</p>
            <PilotForm facilities={facs.map((f) => ({ code: f.code, name: dataText(f.name, lang) }))} current={settings} today={today} />
          </Folded>
        ) : undefined}
      />

      {settings ? (
        <SectionCard title={t('The pilot')}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 28px', fontSize: 13.5 }}>
            <span><span className="text-muted">{t('Facilities')} · </span>{settings.facilities.join(', ')}</span>
            <span><span className="text-muted">{t('Pilot')} · </span>{fmtDate(settings.startOn, lang)} → {fmtDate(addDaysIso(endOfPilot(settings), -1), lang)} ({settings.weeks} {t('weeks')})</span>
            <span><span className="text-muted">{t('Reference measure')} · </span>{settings.baselineWeeks} {t('weeks before the first day')}</span>
          </div>
        </SectionCard>
      ) : (
        <SectionCard title={t('The pilot')}>
          <EmptyState>{t('The pilot is not set yet: the R&D director sets its first day and its facilities. The checklist below runs on every active facility meanwhile.')}</EmptyState>
        </SectionCard>
      )}

      <SectionCard title={t('Checklist of the start')} hint={missingCount ? `${missingCount} ${t('to settle')}` : t('Ready')}
        subtitle={t('Computed from what is recorded in Crucible. The hosting, the Entra registration and the data of the workshop are followed in docs/PILOTE.md.')}>
        <Table>
          <tbody>
            {ready.map((r) => (
              <tr key={r.key}>
                <Td>{r.ok ? <CheckCircle size={16} weight="fill" aria-label={t('Done')} /> : <Circle size={16} aria-label={t('To settle')} />}</Td>
                <Td>{t(READINESS_LABEL[r.key])}</Td>
                <Td>
                  {r.count != null && <span className="text-muted" style={{ marginRight: 10 }}>{r.count}</span>}
                  {r.missing.map((code, i) => (
                    <span key={code}>{i ? ', ' : ''}{FIX[r.key] ? <Link href={FIX[r.key]!(code)}>{code}</Link> : code}</span>
                  ))}
                  {!r.ok && !r.missing.length && FIX[r.key] && <Link href={FIX[r.key]!()}>{t('Settle it')}</Link>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      {cmp && (
        <SectionCard title={t('Reference measure and pilot (X-2)')} scroll
          subtitle={`${t('Before the pilot')} : ${fmtDate(cmp.baseline.all.from, lang)} → ${fmtDate(addDaysIso(cmp.baseline.all.to, -1), lang)}${cmp.pilot ? ` · ${t('Pilot')} : ${fmtDate(cmp.pilot.all.from, lang)} → ${fmtDate(addDaysIso(cmp.pilot.all.to, -1), lang)}` : ` · ${t('the pilot has not started')}`}`}
          actions={cmp.pilot ? <Link href={`/dashboard?from=${cmp.pilot.all.from}&to=${cmp.pilot.all.to}`}>{t('Utilisation dashboard')}</Link> : undefined}>
          {cmp.facilities.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>{t('Facility')}</Th>
                  <Th>{t('Indicator')}</Th>
                  <Th align="right">{t('Before the pilot')}</Th>
                  <Th align="right">{t('Pilot')}</Th>
                  <Th align="right">{t('Difference')}</Th>
                </tr>
              </thead>
              <tbody>
                {[...cmp.facilities.map((f) => ({ key: f.code, name: f.code, m: cmp.baseline.byFacility.get(f.code), p: cmp.pilot?.byFacility.get(f.code) })),
                  ...(cmp.facilities.length > 1 ? [{ key: '*', name: t('All pilot facilities'), m: cmp.baseline.all, p: cmp.pilot?.all }] : [])]
                  .flatMap((g) => rows(g.m, g.p).map((r, i) => (
                    <tr key={`${g.key}-${r.label}`}>
                      <Td>{i === 0 ? <strong>{g.name}</strong> : ''}</Td>
                      <Td>{t(r.label)}</Td>
                      <Td align="right" numeric>{r.ref}</Td>
                      <Td align="right" numeric>{r.pilot}</Td>
                      <Td align="right" numeric>{r.delta}</Td>
                    </tr>
                  )))}
              </tbody>
            </Table>
          ) : (
            <EmptyState>{t('No pilot facility in your scope.')}</EmptyState>
          )}
        </SectionCard>
      )}
    </>
  );
}
