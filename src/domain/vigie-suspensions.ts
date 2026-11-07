// Test suspensions read from Vigie (V-2, Matrix M-21): Vigie's site map holds the outside interventions (works, maintenance
// by a contractor) that suspend the tests of a zone `essais` or `atex`; `vigie.pub_suspensions_essais` publishes them. The
// facility managers say which resources of Crucible each zone holds; each suspension then makes these resources unavailable
// (kind "works") from its first day 00:00 to the day after its last day 00:00, Paris time — whole days, the time range Vigie
// gives is kept in the description only. A suspension Vigie no longer publishes stops being an unavailability, unless it is
// already over (the past stays as it was). Nothing is moved: the bookings it covers are flagged to the facility's managers.
// Pure: no import but dates.
import { addDaysIso, parisInstant } from '@/lib/dates';

/** A row of vigie.pub_suspensions_essais, as Crucible reads it. */
export interface Suspension {
  activiteId: number;
  zoneId: number;
  zoneName: string;
  /** YYYY-MM-DD. */
  fromOn: string;
  toOn: string;
  timeRange: string | null;
  company: string | null;
  reason: string | null;
}

/** A Vigie zone and a resource of Crucible it holds. */
export interface ZoneResource {
  zoneId: number;
  resourceId: string;
}

/** A Vigie unavailability already in Crucible. */
export interface VigieUnavailability {
  id: string;
  resourceId: string;
  sourceRef: string | null;
  label: string;
  startsAt: Date;
  endsAt: Date;
}

export interface UnavailabilityDraft {
  resourceId: string;
  sourceRef: string;
  label: string;
  startsAt: Date;
  endsAt: Date;
}

export const suspensionRef = (activiteId: number) => `suspension:${activiteId}`;

const isIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** The description of the unavailability: what Vigie says, as typed (company · reason · time range), 200 characters at most. */
export function suspensionLabel(s: Pick<Suspension, 'zoneName' | 'company' | 'reason' | 'timeRange'>): string {
  const parts = [s.company, s.reason, s.timeRange].map((x) => x?.trim()).filter((x): x is string => !!x);
  return `Vigie · ${parts.length ? parts.join(' · ') : s.zoneName.trim()}`.slice(0, 200);
}

/**
 * What a read changes: the unavailabilities to add, to change and to remove. `today` (YYYY-MM-DD) and `now` decide what is over:
 * a suspension ended before today is not added, an unavailability already over is never removed.
 */
export function suspensionPlan(rows: readonly Suspension[], zones: readonly ZoneResource[], existing: readonly VigieUnavailability[], today: string, now: Date):
  { add: UnavailabilityDraft[]; change: (UnavailabilityDraft & { id: string })[]; remove: string[]; skipped: number } {
  const want = new Map<string, UnavailabilityDraft>();
  let skipped = 0;
  for (const s of rows) {
    if (!isIso(s.fromOn) || !isIso(s.toOn) || s.toOn < s.fromOn) { skipped++; continue; }
    if (s.toOn < today) continue;
    const startsAt = parisInstant(s.fromOn, '00:00');
    const endsAt = parisInstant(addDaysIso(s.toOn, 1), '00:00');
    for (const z of zones.filter((x) => x.zoneId === s.zoneId)) {
      const sourceRef = suspensionRef(s.activiteId);
      want.set(`${sourceRef}|${z.resourceId}`, { resourceId: z.resourceId, sourceRef, label: suspensionLabel(s), startsAt, endsAt });
    }
  }
  const add: UnavailabilityDraft[] = [];
  const change: (UnavailabilityDraft & { id: string })[] = [];
  const remove: string[] = [];
  const seen = new Set<string>();
  for (const u of existing) {
    const key = `${u.sourceRef ?? ''}|${u.resourceId}`;
    const w = want.get(key);
    if (!w || seen.has(key)) {
      if (u.endsAt > now) remove.push(u.id);
      continue;
    }
    seen.add(key);
    if (w.label !== u.label || w.startsAt.getTime() !== u.startsAt.getTime() || w.endsAt.getTime() !== u.endsAt.getTime()) change.push({ ...w, id: u.id });
  }
  for (const [key, w] of want) if (!seen.has(key)) add.push(w);
  return { add, change, remove, skipped };
}

/** The zone ids as typed by a facility manager for a resource: whole numbers, comma or space separated, 20 at most. */
export function zoneIdsOf(v: unknown): number[] | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return [];
  const parts = s.split(/[\s,;]+/).filter(Boolean);
  if (parts.length > 20 || parts.some((p) => !/^\d{1,9}$/.test(p))) return null;
  return [...new Set(parts.map(Number))].filter((n) => n > 0).sort((a, b) => a - b);
}
