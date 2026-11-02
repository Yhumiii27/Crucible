// Consumables and stock of the tests (CR-076, X-20). Per facility, consumables (gas, reagents, seals, casings…) received in lots
// with an optional expiry date; the stock is the sum of the moves (receipts, uses, adjustments, discards — kept as recorded,
// never changed). A test type needs given quantities per test: when a test of that type ends, its quantities are taken from the
// lots that expire first (an expired lot is never used); what the lots cannot give is recorded without a lot, so the stock shows
// the shortage. Alerts: stock under its threshold, a lot expired with some left, a lot expiring within 30 days. A booking still
// to come is flagged when the stock left after the earlier bookings cannot cover it. Pure: no import.

export const MOVE_KINDS = ['receipt', 'use', 'adjust', 'discard'] as const;
export type MoveKind = (typeof MOVE_KINDS)[number];

/** EN source strings. */
export const MOVE_KIND_LABEL: Record<MoveKind, string> = { receipt: 'Receipt', use: 'Used by a test', adjust: 'Count adjustment', discard: 'Discarded' };

export const EXPIRY_WARNING_DAYS = 30;

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export interface Move {
  consumableId: string;
  lotId: string | null;
  /** Signed: positive in, negative out. */
  quantity: number;
}

export interface Lot {
  id: string;
  consumableId: string;
  lotRef: string;
  /** YYYY-MM-DD, null when it does not expire. */
  expiresOn: string | null;
}

/** Stock per consumable and left per lot, from the moves. */
export function balances(moves: readonly Move[]): { stock: Map<string, number>; byLot: Map<string, number> } {
  const stock = new Map<string, number>();
  const byLot = new Map<string, number>();
  for (const m of moves) {
    stock.set(m.consumableId, r3((stock.get(m.consumableId) ?? 0) + m.quantity));
    if (m.lotId) byLot.set(m.lotId, r3((byLot.get(m.lotId) ?? 0) + m.quantity));
  }
  return { stock, byLot };
}

/**
 * Lots to take `quantity` from on `today`: the lots of the consumable with some left, not expired, the earliest expiry first
 * (no expiry last, then by lot reference); `short` is what they cannot give.
 */
export function pickLots(lots: readonly Lot[], left: ReadonlyMap<string, number>, consumableId: string, quantity: number, today: string):
  { takes: { lotId: string; quantity: number }[]; short: number } {
  const usable = lots
    .filter((l) => l.consumableId === consumableId && (left.get(l.id) ?? 0) > 0 && (l.expiresOn == null || l.expiresOn >= today))
    .sort((a, b) => (a.expiresOn ?? '9999-12-31').localeCompare(b.expiresOn ?? '9999-12-31') || a.lotRef.localeCompare(b.lotRef));
  const takes: { lotId: string; quantity: number }[] = [];
  let need = r3(quantity);
  for (const l of usable) {
    if (need <= 0) break;
    const q = r3(Math.min(need, left.get(l.id) ?? 0));
    takes.push({ lotId: l.id, quantity: q });
    need = r3(need - q);
  }
  return { takes, short: Math.max(0, need) };
}

export type AlertKind = 'low_stock' | 'expired' | 'expiring';

/** EN source strings. */
export const ALERT_LABEL: Record<AlertKind, string> = { low_stock: 'Under the threshold', expired: 'Lot expired', expiring: 'Lot expiring soon' };

export interface ConsumableFacts {
  id: string;
  name: string;
  /** Alert at or under this stock; null = no threshold. */
  threshold: number | null;
}

export interface Alert {
  kind: AlertKind;
  consumableId: string;
  lotId?: string;
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function alertsOf(consumables: readonly ConsumableFacts[], lots: readonly Lot[], moves: readonly Move[], today: string): Alert[] {
  const { stock, byLot } = balances(moves);
  const out: Alert[] = [];
  const soon = addDays(today, EXPIRY_WARNING_DAYS);
  for (const c of consumables) {
    if (c.threshold != null && (stock.get(c.id) ?? 0) <= c.threshold) out.push({ kind: 'low_stock', consumableId: c.id });
    for (const l of lots.filter((x) => x.consumableId === c.id && (byLot.get(x.id) ?? 0) > 0 && x.expiresOn != null)) {
      if (l.expiresOn! < today) out.push({ kind: 'expired', consumableId: c.id, lotId: l.id });
      else if (l.expiresOn! <= soon) out.push({ kind: 'expiring', consumableId: c.id, lotId: l.id });
    }
  }
  return out;
}

export interface Requirement {
  testTypeCode: string;
  consumableId: string;
  /** Per test. */
  quantity: number;
}

/**
 * Bookings to come that the usable stock cannot cover, in start order: the stock that has not expired by the booking's day,
 * less what the earlier bookings need. Returns, per booking id, the consumables short and by how much.
 */
export function shortages(
  upcoming: readonly { id: string; testTypeCode: string | null; day: string }[],
  requirements: readonly Requirement[], lots: readonly Lot[], moves: readonly Move[],
): Map<string, { consumableId: string; short: number }[]> {
  const { stock, byLot } = balances(moves);
  const used = new Map<string, number>();
  const out = new Map<string, { consumableId: string; short: number }[]>();
  for (const b of [...upcoming].sort((x, y) => x.day.localeCompare(y.day))) {
    if (!b.testTypeCode) continue;
    for (const req of requirements.filter((r) => r.testTypeCode === b.testTypeCode)) {
      // What has expired by the booking's day cannot be used for it.
      const expired = lots.filter((l) => l.consumableId === req.consumableId && l.expiresOn != null && l.expiresOn < b.day).reduce((s, l) => s + Math.max(0, byLot.get(l.id) ?? 0), 0);
      const available = r3((stock.get(req.consumableId) ?? 0) - expired - (used.get(req.consumableId) ?? 0));
      used.set(req.consumableId, r3((used.get(req.consumableId) ?? 0) + req.quantity));
      if (available < req.quantity) {
        const list = out.get(b.id) ?? [];
        list.push({ consumableId: req.consumableId, short: r3(req.quantity - Math.max(0, available)) });
        out.set(b.id, list);
      }
    }
  }
  return out;
}

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** A quantity as typed: positive, comma or dot, 3 decimals at most, below one million. */
export function quantityOf(v: unknown): number | null {
  const s = typeof v === 'string' ? v.trim().replace(/\s/g, '').replace(',', '.') : '';
  if (!/^\d{1,6}(\.\d{1,3})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

const optText = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const isIso = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export function checkConsumable(raw: { name: unknown; unit: unknown; threshold: unknown }): Checked<{ name: string; unit: string; threshold: number | null }> {
  const name = optText(raw.name, 120);
  if (!name) return { ok: false, error: 'Give the consumable a name' };
  const unit = optText(raw.unit, 20);
  if (!unit) return { ok: false, error: 'Give the unit (e.g. L, kg, piece)' };
  const t = typeof raw.threshold === 'string' && raw.threshold.trim() ? quantityOf(raw.threshold) : null;
  if (typeof raw.threshold === 'string' && raw.threshold.trim() && t == null) return { ok: false, error: 'The threshold is a positive quantity' };
  return { ok: true, value: { name, unit, threshold: t } };
}

export function checkReceipt(raw: { lotRef: unknown; quantity: unknown; expiresOn: unknown }, today: string): Checked<{ lotRef: string; quantity: number; expiresOn: string | null }> {
  const lotRef = optText(raw.lotRef, 60);
  if (!lotRef) return { ok: false, error: 'Enter the lot reference' };
  const quantity = quantityOf(raw.quantity);
  if (quantity == null) return { ok: false, error: 'Enter a positive quantity' };
  const e = typeof raw.expiresOn === 'string' && raw.expiresOn ? raw.expiresOn : null;
  if (e != null && !isIso(e)) return { ok: false, error: 'Enter the expiry date' };
  if (e != null && e < today) return { ok: false, error: 'This lot has already expired' };
  return { ok: true, value: { lotRef, quantity, expiresOn: e } };
}

/** A count adjustment (signed: "+2" or "-1.5") or a discard (positive, taken out), with its reason. */
export function checkCorrection(raw: { kind: unknown; quantity: unknown; reason: unknown }): Checked<{ kind: 'adjust' | 'discard'; quantity: number; reason: string }> {
  if (raw.kind !== 'adjust' && raw.kind !== 'discard') return { ok: false, error: 'Choose what is recorded' };
  const s = typeof raw.quantity === 'string' ? raw.quantity.trim() : '';
  const neg = s.startsWith('-');
  const q = quantityOf(s.replace(/^[-+]/, ''));
  if (q == null) return { ok: false, error: 'Enter a quantity' };
  const reason = optText(raw.reason, 500);
  if (!reason) return { ok: false, error: 'Give the reason' };
  if (raw.kind === 'discard') return { ok: true, value: { kind: 'discard', quantity: -q, reason } };
  return { ok: true, value: { kind: 'adjust', quantity: neg ? -q : q, reason } };
}
