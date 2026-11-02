// Pure rules of the consumables (CR-076, X-20): stock and lots from the moves, the lots a test takes (earliest expiry first, an
// expired lot never), alerts, bookings to come the stock cannot cover, entries.
import { describe, expect, it } from 'vitest';
import { alertsOf, balances, checkConsumable, checkCorrection, checkReceipt, pickLots, quantityOf, shortages, type Lot, type Move } from './consumables';

const lots: Lot[] = [
  { id: 'A', consumableId: 'c', lotRef: 'L-A', expiresOn: '2026-12-31' },
  { id: 'B', consumableId: 'c', lotRef: 'L-B', expiresOn: '2026-10-25' },
  { id: 'C', consumableId: 'c', lotRef: 'L-C', expiresOn: null },
  { id: 'D', consumableId: 'c', lotRef: 'L-D', expiresOn: '2026-10-01' },
];
const moves: Move[] = [
  { consumableId: 'c', lotId: 'A', quantity: 10 },
  { consumableId: 'c', lotId: 'B', quantity: 5 },
  { consumableId: 'c', lotId: 'C', quantity: 4 },
  { consumableId: 'c', lotId: 'D', quantity: 2 },
  { consumableId: 'c', lotId: 'A', quantity: -3 },
];

describe('balances and pickLots', () => {
  it('the stock is the sum of the moves, per consumable and per lot', () => {
    const { stock, byLot } = balances(moves);
    expect(stock.get('c')).toBe(18);
    expect(Object.fromEntries(byLot)).toEqual({ A: 7, B: 5, C: 4, D: 2 });
  });
  it('the earliest expiry first, no expiry last, an expired lot never; what is missing is short', () => {
    const { byLot } = balances(moves);
    expect(pickLots(lots, byLot, 'c', 8, '2026-10-22')).toEqual({ takes: [{ lotId: 'B', quantity: 5 }, { lotId: 'A', quantity: 3 }], short: 0 });
    expect(pickLots(lots, byLot, 'c', 15, '2026-10-26')).toEqual({ takes: [{ lotId: 'A', quantity: 7 }, { lotId: 'C', quantity: 4 }], short: 4 });
  });
});

describe('alertsOf', () => {
  it('under the threshold, a lot expired with some left, a lot expiring within 30 days', () => {
    const a = alertsOf([{ id: 'c', name: 'Igniters', threshold: 20 }], lots, moves, '2026-10-22');
    expect(a).toEqual([
      { kind: 'low_stock', consumableId: 'c' },
      { kind: 'expiring', consumableId: 'c', lotId: 'B' },
      { kind: 'expired', consumableId: 'c', lotId: 'D' },
    ]);
    expect(alertsOf([{ id: 'c', name: 'Igniters', threshold: null }], lots, moves, '2026-10-22').map((x) => x.kind)).toEqual(['expiring', 'expired']);
  });
});

describe('shortages', () => {
  it('in start order, the stock not expired by the day less the earlier bookings', () => {
    const reqs = [{ testTypeCode: 'FIRING', consumableId: 'c', quantity: 8 }];
    const s = shortages([
      { id: 'late', testTypeCode: 'FIRING', day: '2026-11-03' },
      { id: 'early', testTypeCode: 'FIRING', day: '2026-10-23' },
      { id: 'other', testTypeCode: 'TENSILE', day: '2026-10-23' },
      { id: 'none', testTypeCode: null, day: '2026-10-23' },
    ], reqs, lots, moves);
    // 18 in stock; on 23 Oct lot D (2) has expired: 16 ≥ 8; on 3 Nov B and D have expired: 18 − 7 − 8 = 3 < 8.
    expect(Object.fromEntries(s)).toEqual({ late: [{ consumableId: 'c', short: 5 }] });
  });
});

describe('entries', () => {
  it('quantities, consumables, receipts and corrections', () => {
    expect([quantityOf('2,5'), quantityOf('0'), quantityOf('-1'), quantityOf('1.2345'), quantityOf('12')]).toEqual([2.5, null, null, null, 12]);
    expect(checkConsumable({ name: 'Igniters', unit: 'piece', threshold: '' })).toEqual({ ok: true, value: { name: 'Igniters', unit: 'piece', threshold: null } });
    expect(checkConsumable({ name: 'Igniters', unit: '', threshold: '' })).toMatchObject({ ok: false });
    expect(checkConsumable({ name: 'Igniters', unit: 'piece', threshold: 'few' })).toMatchObject({ ok: false });
    expect(checkReceipt({ lotRef: 'L-1', quantity: '10', expiresOn: '2026-12-31' }, '2026-10-22')).toEqual({ ok: true, value: { lotRef: 'L-1', quantity: 10, expiresOn: '2026-12-31' } });
    expect(checkReceipt({ lotRef: 'L-1', quantity: '10', expiresOn: '2026-10-01' }, '2026-10-22')).toEqual({ ok: false, error: 'This lot has already expired' });
    expect(checkCorrection({ kind: 'adjust', quantity: '-1,5', reason: 'Count' })).toEqual({ ok: true, value: { kind: 'adjust', quantity: -1.5, reason: 'Count' } });
    expect(checkCorrection({ kind: 'discard', quantity: '2', reason: 'Broken' })).toEqual({ ok: true, value: { kind: 'discard', quantity: -2, reason: 'Broken' } });
    expect(checkCorrection({ kind: 'discard', quantity: '2', reason: '' })).toEqual({ ok: false, error: 'Give the reason' });
  });
});
