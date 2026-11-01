import { describe, expect, it } from 'vitest';
import { checkAnswers, itemsText, parseItems, stagesOpen } from './booking-forms';

describe('forms of a booking (CR-075)', () => {
  it('items typed one per line: "=" asks a written answer; back to the same text', () => {
    const r = parseItems('Area marked out\n\n= Pressure read (bar)\n  Extinguisher in place  ');
    expect(r).toEqual({ ok: true, value: [
      { key: 'i1', label: 'Area marked out', kind: 'check' },
      { key: 'i2', label: 'Pressure read (bar)', kind: 'text' },
      { key: 'i3', label: 'Extinguisher in place', kind: 'check' },
    ] });
    expect(r.ok && itemsText(r.value)).toBe('Area marked out\n= Pressure read (bar)\nExtinguisher in place');
    expect(parseItems('  \n ').ok).toBe(false);
    expect(parseItems('=').ok).toBe(false);
    expect(parseItems(Array.from({ length: 31 }, (_, i) => `Item ${i}`).join('\n'))).toEqual({ ok: false, error: 'At most 30 items' });
  });

  it('every box ticked and every written answer given', () => {
    const items = parseItems('Area marked out\n= Pressure read (bar)');
    if (!items.ok) throw new Error();
    expect(checkAnswers(items.value, { i1: 'on', i2: ' 4.2 ' })).toEqual({ ok: true, value: { i1: true, i2: '4.2' } });
    expect(checkAnswers(items.value, { i2: '4.2' })).toEqual({ ok: false, error: 'Tick every item · Area marked out' });
    expect(checkAnswers(items.value, { i1: 'on', i2: ' ' })).toEqual({ ok: false, error: 'Answer every item · Pressure read (bar)' });
  });

  it('which forms a booking takes at each stage', () => {
    expect(stagesOpen('requested')).toEqual([]);
    expect(stagesOpen('confirmed')).toEqual(['before']);
    expect(stagesOpen('in_progress')).toEqual(['before', 'incident', 'after']);
    expect(stagesOpen('done')).toEqual(['after']);
  });
});
