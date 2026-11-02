// Pure rules of the bench systems' API (CR-083, X-17): what a client may declare, the period of a bookings read, the cursor of
// the events, the masking of a confidential project, the delay before the next attempt of a webhook.
import { describe, expect, it } from 'vitest';
import { apiBooking, apiPeriod, checkApiClient, deliveryError, eventCursor, retryDelayMin, webhookAddress } from './api';

const NOW = Date.parse('2026-10-22T09:30:00Z');
const DAY = 86_400_000;

describe('checkApiClient', () => {
  it('needs a name; the webhook is optional, http or https, without credentials', () => {
    expect(checkApiClient({ label: '  ', webhookUrl: '' })).toEqual({ ok: false, error: 'Give the system a name' });
    expect(checkApiClient({ label: 'x'.repeat(81), webhookUrl: '' })).toMatchObject({ ok: false });
    expect(checkApiClient({ label: ' Banc B2 ', webhookUrl: '' })).toEqual({ ok: true, value: { label: 'Banc B2', webhookUrl: null } });
    expect(checkApiClient({ label: 'Banc', webhookUrl: 'https://bench.local/hook#x' })).toEqual({ ok: true, value: { label: 'Banc', webhookUrl: 'https://bench.local/hook' } });
    expect(checkApiClient({ label: 'Banc', webhookUrl: 'http://10.0.0.4:8080/crucible' })).toMatchObject({ ok: true });
    for (const bad of ['ftp://bench', 'https://user:pw@bench.local', 'bench.local/hook', 'javascript:alert(1)', `https://b.fr/${'a'.repeat(500)}`]) {
      expect(webhookAddress(bad)).toBeNull();
    }
  });
});

describe('apiPeriod', () => {
  it('7 days back to 30 days ahead by default; days include their end; at most 186 days', () => {
    expect(apiPeriod(null, null, NOW)).toEqual({ ok: true, value: { from: NOW - 7 * DAY, to: NOW + 30 * DAY } });
    expect(apiPeriod('2026-10-01', '2026-10-31', NOW)).toEqual({ ok: true, value: { from: Date.parse('2026-10-01T00:00:00Z'), to: Date.parse('2026-11-01T00:00:00Z') } });
    expect(apiPeriod('2026-10-01T08:00:00+02:00', null, NOW)).toEqual({ ok: true, value: { from: Date.parse('2026-10-01T06:00:00Z'), to: Date.parse('2026-10-01T06:00:00Z') + 37 * DAY } });
    expect(apiPeriod('yesterday', null, NOW)).toMatchObject({ ok: false });
    expect(apiPeriod('2026-10-31', '2026-10-01', NOW)).toEqual({ ok: false, error: 'to must be after from' });
    expect(apiPeriod('2026-01-01', '2026-12-31', NOW)).toMatchObject({ ok: false });
  });
});

describe('eventCursor', () => {
  it('a whole number, 0 by default', () => {
    expect(eventCursor(null)).toBe(0);
    expect(eventCursor('42')).toBe(42);
    expect(eventCursor('-1')).toBeNull();
    expect(eventCursor('1e3')).toBeNull();
  });
});

describe('apiBooking', () => {
  const b = {
    ref: 'B-2026-0010', resourceCode: 'PDE-LAB', facilityCode: 'PDE', status: 'confirmed', startsAt: new Date('2026-10-22T10:00:00Z'), endsAt: new Date('2026-10-22T15:00:00Z'),
    setupMinutes: 30, teardownMinutes: 0, actualStartAt: null, actualEndAt: null, projectCode: 'RD-SECRET', keystoneCode: 'K-12', entityCode: 'EPC2I', title: 'Ignition tests',
    operators: 'J. Masson', seriesRef: null, confidential: false, updatedAt: new Date('2026-10-20T08:00:00Z'),
  };
  it('shows the project of an open one; masks project, purpose and operators of a confidential one', () => {
    expect(apiBooking(b)).toMatchObject({ project: 'RD-SECRET', keystoneProject: 'K-12', purpose: 'Ignition tests', operators: 'J. Masson', start: '2026-10-22T10:00:00.000Z' });
    const hidden = apiBooking({ ...b, confidential: true });
    expect(hidden).toMatchObject({ project: null, keystoneProject: null, purpose: null, operators: null, confidential: true, entity: 'EPC2I' });
    expect(JSON.stringify(hidden)).not.toMatch(/SECRET|Ignition|Masson/);
  });
});

describe('webhook attempts', () => {
  it('1, 2, 4… up to 60 minutes; a 2xx is a delivery', () => {
    expect([1, 2, 3, 4, 7, 8, 20].map(retryDelayMin)).toEqual([1, 2, 4, 8, 60, 60, 60]);
    expect(deliveryError(204)).toBeNull();
    expect(deliveryError(302)).toBe('HTTP 302');
    expect(deliveryError(500)).toBe('HTTP 500');
  });
});
