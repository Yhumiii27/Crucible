import { describe, expect, it } from 'vitest';
import { parisInstant } from '@/lib/dates';
import { suspensionLabel, suspensionPlan, zoneIdsOf, type Suspension } from './vigie-suspensions';

const s = (o: Partial<Suspension> = {}): Suspension => ({
  activiteId: 7, zoneId: 12, zoneName: 'Banc pyro', fromOn: '2026-11-02', toOn: '2026-11-03', timeRange: '08:00-12:00', company: 'Elec Est', reason: 'Câblage', ...o,
});
const zones = [{ zoneId: 12, resourceId: 'r1' }, { zoneId: 12, resourceId: 'r2' }, { zoneId: 14, resourceId: 'r3' }];
const now = parisInstant('2026-10-22', '12:00');

describe('suspensionLabel', () => {
  it('says what Vigie says, as typed', () => {
    expect(suspensionLabel(s())).toBe('Vigie · Elec Est · Câblage · 08:00-12:00');
    expect(suspensionLabel(s({ company: null, reason: ' ', timeRange: null }))).toBe('Vigie · Banc pyro');
  });
});

describe('suspensionPlan', () => {
  it('a suspension makes every resource of its zone unavailable, whole days, Paris time', () => {
    const p = suspensionPlan([s()], zones, [], '2026-10-22', now);
    expect(p.add).toEqual([
      { resourceId: 'r1', sourceRef: 'suspension:7', label: 'Vigie · Elec Est · Câblage · 08:00-12:00', startsAt: parisInstant('2026-11-02', '00:00'), endsAt: parisInstant('2026-11-04', '00:00') },
      { resourceId: 'r2', sourceRef: 'suspension:7', label: 'Vigie · Elec Est · Câblage · 08:00-12:00', startsAt: parisInstant('2026-11-02', '00:00'), endsAt: parisInstant('2026-11-04', '00:00') },
    ]);
    expect(p.change).toEqual([]);
    expect(p.remove).toEqual([]);
  });

  it('a zone no resource is in, a suspension already over or wrongly dated adds nothing', () => {
    const p = suspensionPlan([s({ zoneId: 99 }), s({ activiteId: 8, toOn: '2026-10-21', fromOn: '2026-10-20' }), s({ activiteId: 9, fromOn: '2026-11-05', toOn: '2026-11-04' })], zones, [], '2026-10-22', now);
    expect(p.add).toEqual([]);
    expect(p.skipped).toBe(1);
  });

  it('follows Vigie: changed dates or text are changed; a withdrawn suspension goes unless over; nothing done twice', () => {
    const had = (id: string, resourceId: string, ref: string, from: string, to: string, label = 'Vigie · Elec Est · Câblage · 08:00-12:00') =>
      ({ id, resourceId, sourceRef: ref, label, startsAt: parisInstant(from, '00:00'), endsAt: parisInstant(to, '00:00') });
    const existing = [
      had('u1', 'r1', 'suspension:7', '2026-11-02', '2026-11-04'),
      had('u2', 'r2', 'suspension:7', '2026-11-02', '2026-11-03'),
      had('u3', 'r3', 'suspension:5', '2026-10-25', '2026-10-26'),
      had('u4', 'r3', 'suspension:4', '2026-10-10', '2026-10-12'),
      had('u5', 'r1', 'suspension:7', '2026-11-02', '2026-11-04'),
    ];
    const p = suspensionPlan([s()], zones, existing, '2026-10-22', now);
    expect(p.add).toEqual([]);
    expect(p.change.map((c) => [c.id, c.endsAt])).toEqual([['u2', parisInstant('2026-11-04', '00:00')]]);
    expect(p.remove).toEqual(['u3', 'u5']);
  });
});

describe('zoneIdsOf', () => {
  it('reads whole numbers, sorted and distinct; empty is none', () => {
    expect(zoneIdsOf('14, 12 12')).toEqual([12, 14]);
    expect(zoneIdsOf('')).toEqual([]);
    expect(zoneIdsOf('12, A')).toBeNull();
    expect(zoneIdsOf(undefined)).toEqual([]);
  });
});
