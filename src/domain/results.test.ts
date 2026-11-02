// Pure rules of the test results (CR-081, X-18): measurements typed one per line, the result as entered, a correction asks why.
import { describe, expect, it } from 'vitest';
import { canHaveResult, checkResult, elnAddress, measurementsText, parseMeasurements } from './results';

describe('parseMeasurements', () => {
  it('reads "name = value unit" and "name; value; unit"; skips blank lines', () => {
    expect(parseMeasurements('Pression max = 212 bar\n\nDurée; 4,2; s\nAspect = conforme\nT = -4.5 °C')).toEqual({
      ok: true,
      value: [
        { name: 'Pression max', value: '212', unit: 'bar' },
        { name: 'Durée', value: '4,2', unit: 's' },
        { name: 'Aspect', value: 'conforme', unit: '' },
        { name: 'T', value: '-4.5', unit: '°C' },
      ],
    });
    expect(parseMeasurements('')).toEqual({ ok: true, value: [] });
  });
  it('names the line it cannot read', () => {
    expect(parseMeasurements('A = 1\nno separator')).toMatchObject({ ok: false, line: 2 });
    expect(parseMeasurements(' = 3')).toMatchObject({ ok: false, line: 1 });
    expect(parseMeasurements('a;b;c;d')).toMatchObject({ ok: false, line: 1 });
    expect(parseMeasurements(Array.from({ length: 51 }, (_, i) => `m${i} = ${i}`).join('\n'))).toMatchObject({ ok: false });
  });
  it('is typed back as read', () => {
    const ms = [{ name: 'P', value: '212', unit: 'bar' }, { name: 'Aspect', value: 'ok', unit: '' }];
    expect(measurementsText(ms)).toBe('P = 212 bar\nAspect = ok');
    expect(parseMeasurements(measurementsText(ms))).toEqual({ ok: true, value: ms });
  });
});

describe('checkResult', () => {
  const base = { outcome: 'pass', measurements: 'P = 212 bar', observations: '', rawDataRef: '', notebookRef: '', elnUrl: '', reason: '' };
  it('a conclusion and at least one measurement or observation', () => {
    expect(checkResult({ ...base, outcome: 'great' }, false)).toEqual({ ok: false, error: 'Choose the conclusion of the test' });
    expect(checkResult({ ...base, measurements: '' }, false)).toEqual({ ok: false, error: 'Enter at least one measurement or an observation' });
    expect(checkResult({ ...base, measurements: '', observations: 'Rupture at 3 s' }, false)).toMatchObject({ ok: true, value: { measurements: [], observations: 'Rupture at 3 s' } });
    expect(checkResult({ ...base, measurements: 'oops' }, false)).toMatchObject({ ok: false, error: expect.stringContaining('(line 1)') });
  });
  it('Codex references and the ELN address', () => {
    expect(checkResult({ ...base, rawDataRef: 'X' }, false)).toEqual({ ok: false, error: 'A Codex reference has 2 to 60 characters' });
    expect(checkResult({ ...base, rawDataRef: ' DAT-PDE-0042 ', notebookRef: 'CL-12', elnUrl: 'https://eln.epc2i.fr/entry/9' }, false))
      .toMatchObject({ ok: true, value: { rawDataRef: 'DAT-PDE-0042', notebookRef: 'CL-12', elnUrl: 'https://eln.epc2i.fr/entry/9' } });
    expect(checkResult({ ...base, elnUrl: 'javascript:alert(1)' }, false)).toEqual({ ok: false, error: 'The ELN address must be an http or https address' });
    expect(elnAddress('https://u:p@eln.fr')).toBeUndefined();
    expect(elnAddress('')).toBeNull();
  });
  it('a correction says why; a first result keeps no reason', () => {
    expect(checkResult(base, true)).toEqual({ ok: false, error: 'Say why the result is corrected' });
    expect(checkResult({ ...base, reason: 'Wrong unit' }, true)).toMatchObject({ ok: true, value: { reason: 'Wrong unit' } });
    expect(checkResult({ ...base, reason: 'ignored' }, false)).toMatchObject({ ok: true, value: { reason: null } });
  });
  it('once the test has started', () => {
    expect(['requested', 'confirmed', 'in_progress', 'done', 'cancelled', 'no_show'].filter(canHaveResult)).toEqual(['in_progress', 'done']);
  });
});
