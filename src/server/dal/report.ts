import 'server-only';
// The monthly report (CR-077, X-16): for a month and the facilities the viewer sees (or one of them), the utilisation of each
// resource — the dashboard's computation, never stored — and the bookings of the month, masked as on the planning (U-3).
import { monthRange, reportLine, totalLine, type ReportLine } from '@/domain/report';
import { parisInstant } from '@/lib/dates';
import { bookingsBetween, resourceUsages, usageFacts } from '@/server/dal/resources';
import type { Viewer } from '@/server/viewer';

export async function monthlyReport(viewer: Viewer, month: string, facilityCode: string | null) {
  const { fromIso, toIso } = monthRange(month);
  const f = await usageFacts(viewer, fromIso, toIso, { fromIso, toIso });
  const usage = resourceUsages(f, fromIso, toIso);
  const facilities = f.facilities.filter((x) => !facilityCode || x.code === facilityCode);
  const codes = new Set(facilities.map((x) => x.code));
  const res = f.resources.filter((r) => codes.has(r.facilityCode));
  const byFacility = facilities.map((fac) => {
    const own = res.filter((r) => r.facilityCode === fac.code);
    return {
      code: fac.code, name: fac.name,
      lines: own.map((r): ReportLine => reportLine(r.code, r.facilityCode, usage.get(r.id)!)),
      total: totalLine(fac.code, fac.code, own.map((r) => usage.get(r.id)!)),
    };
  });
  const bookings = (await bookingsBetween(viewer, res.map((r) => r.id), parisInstant(fromIso, '00:00'), parisInstant(toIso, '00:00')))
    .filter((b) => b.status !== 'requested')
    .sort((a, b) => a.start - b.start);
  return {
    month, fromIso, toIso, facilities: f.facilities, byFacility,
    total: totalLine('total', '', res.map((r) => usage.get(r.id)!)),
    bookings,
  };
}
