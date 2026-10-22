// The business clock of the server — the real clock by default, CRUCIBLE_CLOCK,
// the test override. The test run itself pins CRUCIBLE_CLOCK to the demo data set's date (vitest.config.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_TODAY_ISO, REAL_CLOCK, todayOf } from '@/domain/clock';
import { parisParts } from '@/lib/dates';
import { businessNow, businessToday, clockSetting, setClockForTests } from './clock';

afterEach(() => {
  vi.unstubAllEnvs();
  setClockForTests(null);
});

describe('business clock (server)', () => {
  it('the test run is pinned to the demo data set date, Thu 22 Oct 2026', async () => {
    expect(await businessToday()).toBe(DEMO_TODAY_ISO);
    // The Paris date of the instant (its UTC date is the day before between 00:00 and 02:00 Paris time).
    expect(parisParts(await businessNow()).iso).toBe(DEMO_TODAY_ISO);
  });

  it('unset: the real clock, whatever the database holds', async () => {
    vi.stubEnv('CRUCIBLE_CLOCK', '');
    expect(await clockSetting()).toEqual(REAL_CLOCK);
    expect(await businessToday()).toBe(todayOf(REAL_CLOCK));
  });

  it('CRUCIBLE_CLOCK: "real" or a pinned date', async () => {
    vi.stubEnv('CRUCIBLE_CLOCK', 'real');
    expect(await businessToday()).toBe(todayOf(REAL_CLOCK));
    vi.stubEnv('CRUCIBLE_CLOCK', '2027-03-01');
    expect(await businessToday()).toBe('2027-03-01');
  });

  it('the test override wins over everything', async () => {
    vi.stubEnv('CRUCIBLE_CLOCK', 'real');
    setClockForTests({ kind: 'fixed', iso: '2028-02-29' });
    expect(await businessToday()).toBe('2028-02-29');
  });
});
