import { describe, expect, it } from 'vitest';
import { clientAddress, retryAfter, windowStart } from './rate-limit';

describe('limits of attempts (CR-079)', () => {
  it('fixed windows and the time left', () => {
    const t = Date.UTC(2026, 10, 1, 10, 7, 30);
    expect(windowStart(t, 600)).toBe(Date.UTC(2026, 10, 1, 10, 0, 0));
    expect(retryAfter(t, 600)).toBe(150);
    expect(retryAfter(windowStart(t, 60), 60)).toBe(60);
  });

  it('the address the proxy saw: the last entry it appended, never what the client wrote first', () => {
    expect(clientAddress('6.6.6.6, 10.0.0.7', null)).toBe('10.0.0.7');
    expect(clientAddress('203.0.113.9', '10.0.0.1')).toBe('203.0.113.9');
    expect(clientAddress(null, ' 198.51.100.4 ')).toBe('198.51.100.4');
    expect(clientAddress(null, null)).toBeNull();
    expect(clientAddress(' , ', null)).toBeNull();
  });
});
