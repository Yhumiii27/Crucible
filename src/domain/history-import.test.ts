import { describe, expect, it } from 'vitest';
import { parisInstant } from '@/lib/dates';
import { parseHistory } from './history-import';

const ctx = { resources: new Set(['PDE-PIL']), projects: new Set(['RD-ORION']), today: '2026-10-22' };

describe('history import (F-9)', () => {
  it('reads lines separated by ";" or tabs, skips the header; empty actual times = as booked; "absent" = not held', () => {
    const r = parseHistory([
      'resource;project;start;end;actual start;actual end;purpose',
      'pde-pil;RD-ORION;2026-09-01 07:00;2026-09-01 17:00;2026-09-01 07:30;2026-09-01 16:00;Firing tests',
      'PDE-PIL\tRD-ORION\t2026-09-02 07:00\t2026-09-02 12:00\t\t\tCalibration',
      'PDE-PIL;RD-ORION;2026-09-03 07:00;2026-09-03 12:00;absent;;Booked, not used',
    ].join('\n'), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((l) => [l.resourceCode, l.status, l.title])).toEqual([['PDE-PIL', 'done', 'Firing tests'], ['PDE-PIL', 'done', 'Calibration'], ['PDE-PIL', 'no_show', 'Booked, not used']]);
    expect(r.value[0].actualStart).toEqual(parisInstant('2026-09-01', '07:30'));
    expect(r.value[1].actualEnd).toEqual(parisInstant('2026-09-02', '12:00'));
    expect(r.value[2].actualStart).toBeNull();
  });

  it('refuses unknown codes, future lines, bad times — naming the line', () => {
    expect(parseHistory('PDE-ATM;RD-ORION;2026-09-01 07:00;2026-09-01 17:00;;;Test', ctx)).toEqual({ ok: false, error: 'Line 1 · Unknown resource' });
    expect(parseHistory('PDE-PIL;RD-ORION;2026-10-22 07:00;2026-10-22 17:00;;;Test', ctx)).toEqual({ ok: false, error: 'Line 1 · Only past bookings are imported' });
    expect(parseHistory('PDE-PIL;RD-ORION;2026-09-01 17:00;2026-09-01 07:00;;;Test', ctx)).toEqual({ ok: false, error: 'Line 1 · Invalid start or end' });
    expect(parseHistory('PDE-PIL;RD-ORION;2026-09-01', ctx)).toEqual({ ok: false, error: 'Line 1 · 7 columns expected' });
    expect(parseHistory('  ', ctx)).toEqual({ ok: false, error: 'Paste at least one line' });
  });
});
