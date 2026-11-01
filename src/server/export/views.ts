import 'server-only';
// The rows of the header's Export (delivery 5b): what the screen shows, with the same reads and the same masks (U-3) — the
// bookings of the planning week, the load of the next 26 weeks, the proposals of the latest run, the conflict sheets, the
// incidents and scenarios, the decisions waiting. Column titles in the viewer's language; typed text as typed.
import { mondayOf } from '@/domain/calendar';
import { CONFLICT_STATUS_LABEL, PROPOSAL_STATUS_LABEL } from '@/domain/planning-vocabulary';
import { BOOKING_STATUS_LABEL } from '@/domain/resources';
import type { Move } from '@/domain/recovery';
import { INCIDENT_KIND_LABEL, INCIDENT_STATUS_LABEL, SCENARIO_KIND_LABEL, SCENARIO_STATUS_LABEL } from '@/domain/recovery-vocabulary';
import { dataText } from '@/i18n/data-text';
import { makeT, type Lang } from '@/i18n/translate';
import { isIsoDate } from '@/domain/clock';
import { fmtDate, fmtInstant } from '@/lib/format';
import { decisionQueue } from '@/server/dal/decisions';
import { incidentsScreen } from '@/server/dal/incidents';
import { DETAIL_WEEKS, loadScreen } from '@/server/dal/needs';
import { conflictsScreen, proposeScreen } from '@/server/dal/planning';
import { monthlyReport } from '@/server/dal/report';
import { planningWeek } from '@/server/dal/resources';
import { parseMonth } from '@/domain/report';
import type { Viewer } from '@/server/viewer';

export type Cell = string | number | null;

/** Screens with an export. */
export const EXPORTABLE = ['planning', 'load', 'propose', 'conflicts', 'incidents', 'decide', 'report'] as const;
export type ExportableScreen = (typeof EXPORTABLE)[number];
export const isExportable = (v: string): v is ExportableScreen => (EXPORTABLE as readonly string[]).includes(v);

export async function exportRows(screen: ExportableScreen, viewer: Viewer, params: URLSearchParams, lang: Lang, today: string): Promise<Cell[][]> {
  const t = makeT(lang);
  const at = (ms: number) => fmtInstant(new Date(ms), lang);
  switch (screen) {
    case 'planning': {
      const w = params.get('week');
      const monday = mondayOf(w && isIsoDate(w) ? w : today);
      const data = await planningWeek(viewer, monday);
      return [
        [t('Booking'), t('Resource'), t('Facility'), t('From'), t('To'), t('Status'), t('Entity'), t('Project'), t('Purpose'), t('Requested by')],
        ...data.plan.map((b) => [b.ref, b.resourceCode, b.facilityCode, at(b.start), at(b.end), t(BOOKING_STATUS_LABEL[b.status]), b.entityCode, b.projectCode ?? t('Project not visible'), b.title ? dataText(b.title, lang) : '', b.requestedByName]),
      ];
    }
    case 'load': {
      const data = await loadScreen(viewer, today);
      const weeks = data.weeks.slice(0, DETAIL_WEEKS);
      const rows: Cell[][] = [[t('Resource'), t('Facility'), ...weeks.map((m) => fmtDate(m, lang))]];
      for (const r of data.resources) {
        const wl = data.forecast.byResource.get(r.id) ?? [];
        rows.push([r.code, r.facilityCode, ...weeks.map((_, i) => (wl[i]?.ratio == null ? null : Math.round(wl[i].ratio! * 100)))]);
      }
      for (const rule of data.rules) {
        const wl = data.forecast.byRule.get(rule.code) ?? [];
        rows.push([rule.code, rule.facilityCodes.join(' · '), ...weeks.map((_, i) => (wl[i]?.ratio == null ? null : Math.round(wl[i].ratio! * 100)))]);
      }
      return rows;
    }
    case 'propose': {
      const data = await proposeScreen(viewer);
      return [
        [t('Run'), t('Need'), t('Project'), t('Resource'), t('From'), t('To'), t('Late (working days)'), t('Status')],
        ...data.proposals.map(({ p, resourceCode }) => {
          const n = data.needs.get(p.needId);
          return [data.run?.ref ?? '', n?.ref ?? '', n?.projectCode ?? t('Project not visible'), resourceCode, at(p.startsAt.getTime()), at(p.endsAt.getTime()), p.lateDays, t(PROPOSAL_STATUS_LABEL[p.status])];
        }),
      ];
    }
    case 'conflicts': {
      const data = await conflictsScreen(viewer);
      return [
        [t('Conflict'), t('Subject'), t('Needs'), t('Status'), t('Decision due'), t('Recommended')],
        ...data.conflicts.map((c) => [c.ref, c.subject, c.needIds.map((id) => data.needs.get(id)?.ref ?? '').join(' · '), t(CONFLICT_STATUS_LABEL[c.status]), fmtDate(c.dueOn, lang), c.recommendedKey]),
      ];
    }
    case 'incidents': {
      const data = await incidentsScreen(viewer);
      const code = (id: string | null) => (id ? data.resourceCode.get(id) ?? '' : '');
      return [
        [t('Reference'), t('Kind'), t('Resource'), t('Description'), t('From'), t('To'), t('Status'), t('Bookings moved')],
        ...data.incidents.map((i) => [i.ref, t(INCIDENT_KIND_LABEL[i.kind]), code(i.resourceId), dataText(i.label, lang), at(i.startsAt.getTime()), at(i.endsAt.getTime()), t(INCIDENT_STATUS_LABEL[i.status]), '']),
        ...data.scenarios.map((s) => [s.ref, t(SCENARIO_KIND_LABEL[s.kind]), '', '', fmtInstant(s.createdAt, lang), '', t(SCENARIO_STATUS_LABEL[s.status]), (s.moves as Move[]).length]),
      ];
    }
    case 'decide': {
      const q = await decisionQueue(viewer);
      const kind = { conflict: 'Conflict', scenario: 'Scenario', proposals: 'Proposals', unplaced: 'Need not placed' } as const;
      return [[t('Kind'), t('Reference'), t('Details')], ...q.items.map((i) => [t(kind[i.kind]), i.ref, i.kind === 'conflict' ? `${i.subject} · ${i.needs.join(' / ')}` : i.kind === 'proposals' ? String(i.count) : i.kind === 'scenario' ? (i.incidentRef ?? '') : (i.projectCode ?? '')])];
    }
    case 'report': {
      // CR-077: one line per resource of the monthly report (the month and facility of the screen).
      const month = parseMonth(params.get('month')) ?? today.slice(0, 7);
      const data = await monthlyReport(viewer, month, params.get('facility'));
      return [
        [t('Month'), t('Facility'), t('Resource'), t('Open hours'), t('Booked hours'), t('Booked %'), t('Realised hours'), t('Realised %'), t('Blocked hours'), t('Blocked %'), t('Not held')],
        ...data.byFacility.flatMap((f) => f.lines.map((l) => [month, f.code, l.code, l.netOpenHours, l.bookedHours, l.bookedRate, l.realisedHours, l.realisedRate, l.blockedHours, l.blockedRate, l.noShows])),
      ];
    }
  }
}
