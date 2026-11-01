// Incidents & scenarios (docs/spec/03 §7, 05 "Aléas et scénarios", decisions A-8; delivery 5): declare an incident — a
// breakdown takes a resource out, an absence a person — and Crucible computes the recovery scenario at once: the bookings touched,
// placed again (resource, then a validated substitute, qualified people, equipment), and the consequences per project before
// and after. The decider accepts it (the bookings are moved and their requesters notified) or rejects it. Urgencies (the R&D
// director, the coordinator) and what-if simulations (never applied) use the same mechanism. Delivery 5b: the three forms in side
// panels opened from the header, each scenario as a card — its facts, then before → after per booking, then the decision.
import { notFound } from 'next/navigation';
import { Folded } from '@/components/app/ActionForm';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Tag } from '@/components/ds/Tag';
import { Table, Td, Th } from '@/components/ds/Table';
import { canSee } from '@/config/screens';
import { UNPLACED_REASON_LABEL, type UnplacedReason } from '@/domain/planning-vocabulary';
import { INCIDENT_KIND_LABEL, INCIDENT_STATUS_LABEL, SCENARIO_KIND_LABEL, SCENARIO_STATUS_LABEL } from '@/domain/recovery-vocabulary';
import { managedFacilities } from '@/domain/rights';
import { CloseIncidentButton, DecideScenarioForm, IncidentForm, SimulationForm, UrgencyForm } from '@/features/incidents/forms';
import { dataText } from '@/i18n/data-text';
import { parisParts } from '@/lib/dates';
import { fmtDate, fmtInstant, fmtSlot } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { incidentsScreen } from '@/server/dal/incidents';
import { getI18n, getViewer } from '@/server/session';
import st from './incidents.module.css';

const DECLARERS = ['rd_director', 'coordinator', 'facility_manager', 'safety', 'project_lead', 'technician', 'partner'];

export default async function IncidentsPage() {
  const [{ t, lang }, viewer, today] = await Promise.all([getI18n(), getViewer(), businessToday()]);
  if (!canSee(viewer.role, 'incidents')) notFound();
  const data = await incidentsScreen(viewer);
  const code = (id: string | null | undefined) => (id ? data.resourceCode.get(id) ?? '' : '');
  const project = (p: string) => (data.seenProject.has(p) ? p : t('Project not visible'));
  const deciding = viewer.role === 'rd_director' || viewer.role === 'coordinator';
  const mine = managedFacilities(viewer.role, viewer.assignments);
  return (
    <>
      <PageHeader
        screen="incidents"
        crumbs={['Planning']}
        primary={
          <>
            {['rd_director', 'coordinator', 'project_lead'].includes(viewer.role) && data.resources.length > 0 && (
              <Folded summary="Simulate a what-if" size="md" title="What if?">
                <p className="text-muted">{t('A simulation: the consequences if a resource were out of service, without moving or notifying anything.')}</p>
                <SimulationForm resources={data.resources.map((r) => ({ value: r.id, label: `${r.code} · ${dataText(r.name, lang)}` }))} />
              </Folded>
            )}
            {deciding && data.openNeeds.length > 0 && (
              <Folded summary="Declare an urgency" size="md">
                <p className="text-muted">{t('An urgent test passes first, even inside the frozen window; the bookings it displaces are placed again after it. The decider validates the moves; urgencies are counted in the steering (A-8).')}</p>
                <UrgencyForm needs={data.openNeeds.map((n) => ({ value: n.id, label: `${n.ref} · ${n.projectCode} · ${dataText(n.title, lang)}` }))} />
              </Folded>
            )}
            {DECLARERS.includes(viewer.role) && (data.resources.length > 0 || data.people.length > 0) && (
              <Folded summary="Declare an incident" variant="primary" size="md">
                <p className="text-muted">{t('A breakdown makes the resource unavailable; an absence takes the person out. The recovery scenario is computed at once and submitted to the decider: nothing moves without a decision.')}</p>
                <IncidentForm today={today} resources={data.resources.map((r) => ({ value: r.id, label: `${r.code} · ${dataText(r.name, lang)}` }))} people={data.people.map((p) => ({ value: p.id, label: p.name }))} />
              </Folded>
            )}
          </>
        }
      />
      <SectionCard title={t('Scenarios')} hint={String(data.scenarios.length)} subtitle={t('Only the bookings touched move; every other booking stays (frozen window). Each move respects every hard constraint.')}>
        {data.scenarios.length ? data.scenarios.map((s) => {
          const hyp = s.hypothesis as { resource?: string; fromOn?: string; toOn?: string; urgentSlot?: { resourceId: string; start: number; end: number } } | null;
          return (
            <div key={s.id} className={s.status === 'submitted' ? `${st.card} ${st.pending}` : st.card}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <strong>{s.ref}</strong>
                <span>{t(SCENARIO_KIND_LABEL[s.kind])}</span>
                <Tag size="sm" tone={s.status === 'submitted' ? 'accent' : 'outline'}>{t(SCENARIO_STATUS_LABEL[s.status])}</Tag>
                <span className="text-muted">{fmtInstant(s.createdAt, lang)} · {s.createdByName} · {t('rules')} v{s.ruleVersion}</span>
                {hyp?.resource && <span className="text-muted">{t('Hypothesis')} : {hyp.resource} {t('out of service')} {fmtDate(hyp.fromOn!, lang)} → {fmtDate(hyp.toOn!, lang)}</span>}
                {hyp?.urgentSlot && <span>{t('Urgent test')} : {code(hyp.urgentSlot.resourceId)} · {fmtSlot(hyp.urgentSlot.start, hyp.urgentSlot.end, lang)}</span>}
              </div>
              <div className={st.facts}>
                <div className={st.fact}><span className={st.label}>{t('Bookings touched')}</span><span className={st.value}>{s.moves.length}</span><span className={st.sub}>{t('the others stay (frozen window)')}</span></div>
                <div className={st.fact}><span className={st.label}>{t('Late after recovery')}</span><span className={st.value}>{s.impacts.reduce((a, x) => a + (x.lateAfter ?? 0), 0)} {t('working days')}</span><span className={st.sub}>{s.impacts.some((x) => x.lateAfter == null) ? t('some tests not placed') : s.impacts.every((x) => (x.lateAfter ?? 0) === 0) ? t('every deadline kept') : t('deadlines missed')}</span></div>
                <div className={st.fact}><span className={st.label}>{t('Projects touched')}</span><span className={st.value}>{new Set(s.moves.map((m) => m.projectCode)).size}</span><span className={st.sub}>{[...new Set(s.moves.map((m) => project(m.projectCode)))].join(' · ')}</span></div>
              </div>
              {s.moves.length ? (
                <Table>
                  <thead>
                    <tr>
                      <Th>{t('Booking')}</Th>
                      <Th>{t('Project')}</Th>
                      <Th>{t('Before')}</Th>
                      <Th>{t('After')}</Th>
                      <Th>{t('Deadline')}</Th>
                      <Th align="right">{t('Late before')}</Th>
                      <Th align="right">{t('Late after')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.moves.map((m) => {
                      const imp = s.impacts.find((x) => x.ref === m.ref);
                      return (
                        <tr key={m.bookingId}>
                          <Td>{m.ref}{m.needRef && <div className="text-muted">{m.needRef}</div>}</Td>
                          <Td>{project(m.projectCode)}</Td>
                          <Td nowrap>{code(m.from.resourceId)} · {fmtSlot(m.from.start, m.from.end, lang)}</Td>
                          <Td nowrap>
                            {m.to ? `${code(m.to.resourceId)}${m.to.substitute ? ` (${t('validated substitute')})` : ''} · ${fmtSlot(m.to.start, m.to.end, lang)}` : t(UNPLACED_REASON_LABEL[(m.reason ?? 'no_slot') as UnplacedReason])}
                            {m.staff.length > 0 && <div className="text-muted">{m.staff.map((x) => data.personName.get(x.personId) ?? '').join(', ')}</div>}
                          </Td>
                          <Td nowrap>{imp ? fmtDate(imp.deadlineOn, lang) : '—'}</Td>
                          <Td align="right" numeric>{imp?.lateBefore ?? '—'}</Td>
                          <Td align="right" numeric>{imp ? (imp.lateAfter == null ? t('Not placed') : imp.lateAfter) : '—'}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              ) : (
                <span className="text-muted">{t('No booking moves.')}</span>
              )}
              {s.decidedByName && <span className="text-muted">{t('Decided by')} {s.decidedByName} · {fmtInstant(s.decidedAt!, lang)}{s.decisionReason ? ` — ${dataText(s.decisionReason, lang)}` : ''}</span>}
              {s.status === 'submitted' && deciding && <DecideScenarioForm scenarioId={s.id} />}
            </div>
          );
        }) : <EmptyState>{t('No scenario yet.')}</EmptyState>}
      </SectionCard>

      <SectionCard title={t('Incidents')} hint={String(data.incidents.length)} scroll>
        {data.incidents.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Incident')}</Th>
                <Th>{t('Kind')}</Th>
                <Th>{t('Description')}</Th>
                <Th>{t('Period')}</Th>
                <Th>{t('Declared by')}</Th>
                <Th>{t('Status')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.incidents.map((i) => (
                <tr key={i.id}>
                  <Td>{i.ref}</Td>
                  <Td>{t(INCIDENT_KIND_LABEL[i.kind])}{i.resourceId && <div className="text-muted">{code(i.resourceId)}</div>}{i.personId && <div className="text-muted">{data.personName.get(i.personId)}</div>}</Td>
                  <Td>{dataText(i.label, lang)}</Td>
                  <Td nowrap>{i.kind === 'urgency' ? fmtSlot(i.startsAt.getTime(), i.endsAt.getTime(), lang) : `${fmtDate(parisParts(i.startsAt).iso, lang)} → ${fmtDate(parisParts(new Date(i.endsAt.getTime() - 1)).iso, lang)}`}</Td>
                  <Td>{i.declaredByName}</Td>
                  <Td>
                    {t(INCIDENT_STATUS_LABEL[i.status])}
                    {i.status === 'open' && (i.declaredByUserId === viewer.userId || viewer.role === 'rd_director' || (i.resourceId && mine.length > 0)) && <> <CloseIncidentButton id={i.id} /></>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No incident.')}</EmptyState>
        )}
      </SectionCard>
    </>
  );
}
