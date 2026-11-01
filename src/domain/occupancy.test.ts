// The rules of the measured occupancy (CR-071, X-8): an event starts or ends the booking of its resource, or is kept as a use
// without a booking; its instant is checked; uses without a booking are paired from the events.
import { describe, expect, it } from 'vitest';
import { checkDevice, eventInstant, reconcile, unbookedUses, type SlotFacts } from './occupancy';

const H = 3_600_000;
const at = (h: number) => Date.UTC(2026, 9, 22, h);
const slot = (id: string, from: number, to: number, o: Partial<SlotFacts> = {}): SlotFacts => ({ id, status: 'confirmed', start: at(from), end: at(to), setupMinutes: 30, actualStart: null, ...o });

describe('reconcile', () => {
  it('a start inside the slot, or up to the preparation and 30 minutes before it, starts the booking', () => {
    const slots = [slot('a', 10, 15), slot('b', 16, 18)];
    expect(reconcile({ kind: 'start', at: at(11) }, slots, false)).toEqual({ kind: 'started', bookingId: 'a' });
    expect(reconcile({ kind: 'start', at: at(9) }, slots, false)).toEqual({ kind: 'started', bookingId: 'a' });
    expect(reconcile({ kind: 'start', at: at(9) - 1 }, slots, false)).toEqual({ kind: 'unbooked_start' });
    expect(reconcile({ kind: 'start', at: at(15) + 0.25 * H }, slots, false)).toEqual({ kind: 'started', bookingId: 'b' });
  });

  it('two slots holding the instant: the earliest starts', () => {
    expect(reconcile({ kind: 'start', at: at(12) }, [slot('late', 12, 14), slot('early', 11, 13)], false)).toEqual({ kind: 'started', bookingId: 'early' });
  });

  it('a start while a test runs, or while a use without a booking is open, is ignored', () => {
    expect(reconcile({ kind: 'start', at: at(11) }, [slot('a', 10, 15, { status: 'in_progress', actualStart: at(10) })], false))
      .toEqual({ kind: 'ignored', reason: 'A test is already running on this resource' });
    expect(reconcile({ kind: 'start', at: at(20) }, [], true)).toEqual({ kind: 'ignored', reason: 'A use without a booking is already open on this resource' });
  });

  it('a stop ends the running test, else the open use without a booking, else is ignored', () => {
    const running = [slot('a', 10, 15, { status: 'in_progress', actualStart: at(10) })];
    expect(reconcile({ kind: 'stop', at: at(14) }, running, true)).toEqual({ kind: 'ended', bookingId: 'a' });
    expect(reconcile({ kind: 'stop', at: at(9) }, running, false)).toEqual({ kind: 'ignored', reason: 'The stop comes before the start of the test' });
    expect(reconcile({ kind: 'stop', at: at(20) }, [slot('b', 10, 15)], true)).toEqual({ kind: 'unbooked_stop' });
    expect(reconcile({ kind: 'stop', at: at(20) }, [slot('b', 10, 15)], false)).toEqual({ kind: 'ignored', reason: 'Nothing is running on this resource' });
  });
});

describe('eventInstant', () => {
  const now = at(12);
  it('now when absent; an ISO instant with its zone within the last 24 hours and up to 2 minutes ahead', () => {
    expect(eventInstant(undefined, now)).toEqual({ ok: true, at: now });
    expect(eventInstant('2026-10-22T11:30:00Z', now)).toEqual({ ok: true, at: at(11) + 0.5 * H });
    expect(eventInstant('2026-10-22T14:00:00+02:00', now)).toEqual({ ok: true, at: at(12) });
    expect(eventInstant('2026-10-22T11:30:00', now)).toEqual({ ok: false, error: 'at must be an ISO 8601 instant with its zone' });
    expect(eventInstant('2026-10-22T12:05:00Z', now)).toEqual({ ok: false, error: 'at is in the future' });
    expect(eventInstant('2026-10-21T11:00:00Z', now)).toEqual({ ok: false, error: 'at is more than 24 hours old' });
    expect(eventInstant(42, now).ok).toBe(false);
  });
});

describe('unbookedUses', () => {
  it('pairs the starts and stops without a booking in time order; an open one has no end', () => {
    expect(unbookedUses([
      { outcome: 'unbooked_stop', at: at(9), deviceLabel: 'K' },
      { outcome: 'unbooked_start', at: at(8), deviceLabel: 'K' },
      { outcome: 'started', at: at(10), deviceLabel: 'K' },
      { outcome: 'unbooked_start', at: at(18), deviceLabel: 'A' },
    ])).toEqual([{ from: at(8), to: at(9), deviceLabel: 'K' }, { from: at(18), to: null, deviceLabel: 'A' }]);
  });
});

describe('checkDevice', () => {
  const ctx = { resourceIds: new Set(['r1']) };
  it('a resource of the facility, a kind, a name', () => {
    expect(checkDevice({ resourceId: 'r1', kind: 'kiosk', label: ' Borne entrée ' }, ctx)).toEqual({ ok: true, value: { resourceId: 'r1', kind: 'kiosk', label: 'Borne entrée' } });
    expect(checkDevice({ resourceId: 'r2', kind: 'kiosk', label: 'x1' }, ctx)).toEqual({ ok: false, error: 'Choose a resource of the facility' });
    expect(checkDevice({ resourceId: 'r1', kind: 'laser', label: 'x1' }, ctx)).toEqual({ ok: false, error: 'Choose the kind of device' });
    expect(checkDevice({ resourceId: 'r1', kind: 'badge', label: 'x' }, ctx)).toEqual({ ok: false, error: 'Name the device (2 to 80 characters)' });
  });
});
