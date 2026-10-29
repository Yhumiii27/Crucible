// Real occupancy measured without a declaration (CR-071, decision X-8): a kiosk at the entrance of a resource, an agent on the
// bench PC, a hardware interlock or a badge reader sends "start" and "stop" events; each is matched to the booking of the
// resource (start → the test is started, stop → it is ended) or kept as a use without a booking. The release of a no-show
// stays a person's decision (A-7). Pure.

export const DEVICE_KINDS = ['kiosk', 'agent', 'interlock', 'badge'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];
/** EN source labels. */
export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = {
  kiosk: 'Kiosk',
  agent: 'Bench PC agent',
  interlock: 'Interlock',
  badge: 'Badge reader',
};

export const OCCUPANCY_EVENT_KINDS = ['start', 'stop'] as const;
export type OccupancyEventKind = (typeof OCCUPANCY_EVENT_KINDS)[number];

export const OCCUPANCY_OUTCOMES = ['started', 'ended', 'unbooked_start', 'unbooked_stop', 'ignored'] as const;
export type OccupancyOutcome = (typeof OCCUPANCY_OUTCOMES)[number];
/** EN source labels. */
export const OCCUPANCY_OUTCOME_LABEL: Record<OccupancyOutcome, string> = {
  started: 'Test started',
  ended: 'Test ended',
  unbooked_start: 'Use without a booking started',
  unbooked_stop: 'Use without a booking ended',
  ignored: 'Ignored',
};

/** A start up to this long before the slot (its preparation included) starts the booking. */
export const START_TOLERANCE_MIN = 30;
/** An event dated more than this long ago is refused (a device that stayed offline sends late, not days later). */
export const MAX_EVENT_AGE_HOURS = 24;
/** Clock drift accepted for an event dated in the future. */
export const MAX_EVENT_AHEAD_MIN = 2;

/** A booking of the resource around the event. */
export interface SlotFacts {
  id: string;
  status: string;
  /** Slot, epoch ms. */
  start: number;
  end: number;
  setupMinutes: number;
  actualStart: number | null;
}

export type Reconciliation =
  | { kind: 'started'; bookingId: string }
  | { kind: 'ended'; bookingId: string }
  | { kind: 'unbooked_start' }
  | { kind: 'unbooked_stop' }
  | { kind: 'ignored'; reason: string };

const MIN = 60_000;

/**
 * What an event does. `unbookedOpen`: a use without a booking was started on the resource and not ended yet.
 * - start: a test already running → ignored; else the confirmed booking whose slot (preparation and tolerance included) holds
 *   the instant → started (the earliest when several); else a use without a booking starts (ignored when one is open already).
 * - stop: the running test → ended (ignored when its actual start comes after the event); else the open use without a booking
 *   ends; else ignored.
 */
export function reconcile(event: { kind: OccupancyEventKind; at: number }, slots: readonly SlotFacts[], unbookedOpen: boolean): Reconciliation {
  const running = slots.filter((s) => s.status === 'in_progress').sort((a, b) => (a.actualStart ?? a.start) - (b.actualStart ?? b.start));
  if (event.kind === 'start') {
    if (running.length) return { kind: 'ignored', reason: 'A test is already running on this resource' };
    const candidate = slots
      .filter((s) => s.status === 'confirmed' && event.at >= s.start - (s.setupMinutes + START_TOLERANCE_MIN) * MIN && event.at < s.end)
      .sort((a, b) => a.start - b.start)[0];
    if (candidate) return { kind: 'started', bookingId: candidate.id };
    return unbookedOpen ? { kind: 'ignored', reason: 'A use without a booking is already open on this resource' } : { kind: 'unbooked_start' };
  }
  const test = running[running.length - 1];
  if (test) {
    if (test.actualStart != null && test.actualStart > event.at) return { kind: 'ignored', reason: 'The stop comes before the start of the test' };
    return { kind: 'ended', bookingId: test.id };
  }
  return unbookedOpen ? { kind: 'unbooked_stop' } : { kind: 'ignored', reason: 'Nothing is running on this resource' };
}

/** The instant of an event: given (ISO 8601 with a zone) or now; refused when too old or in the future. */
export function eventInstant(raw: unknown, now: number): { ok: true; at: number } | { ok: false; error: string } {
  if (raw == null || raw === '') return { ok: true, at: now };
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(raw)) return { ok: false, error: 'at must be an ISO 8601 instant with its zone' };
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return { ok: false, error: 'at must be an ISO 8601 instant with its zone' };
  if (at > now + MAX_EVENT_AHEAD_MIN * MIN) return { ok: false, error: 'at is in the future' };
  if (at < now - MAX_EVENT_AGE_HOURS * 60 * MIN) return { ok: false, error: `at is more than ${MAX_EVENT_AGE_HOURS} hours old` };
  return { ok: true, at };
}

/** Uses without a booking, paired from the events in time order (an open one has no end). */
export function unbookedUses(events: readonly { outcome: string; at: number; deviceLabel: string }[]): { from: number; to: number | null; deviceLabel: string }[] {
  const out: { from: number; to: number | null; deviceLabel: string }[] = [];
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    if (e.outcome === 'unbooked_start') out.push({ from: e.at, to: null, deviceLabel: e.deviceLabel });
    else if (e.outcome === 'unbooked_stop') {
      const open = out.findLast((u) => u.to == null);
      if (open) open.to = e.at;
    }
  }
  return out;
}

/** A device as entered by a facility manager. */
export function checkDevice(raw: Record<string, unknown>, ctx: { resourceIds: ReadonlySet<string> }):
  { ok: true; value: { resourceId: string; kind: DeviceKind; label: string } } | { ok: false; error: string } {
  const resourceId = String(raw.resourceId ?? '');
  if (!ctx.resourceIds.has(resourceId)) return { ok: false, error: 'Choose a resource of the facility' };
  const kind = String(raw.kind ?? '') as DeviceKind;
  if (!DEVICE_KINDS.includes(kind)) return { ok: false, error: 'Choose the kind of device' };
  const label = String(raw.label ?? '').trim();
  if (label.length < 2 || label.length > 80) return { ok: false, error: 'Name the device (2 to 80 characters)' };
  return { ok: true, value: { resourceId, kind, label } };
}
