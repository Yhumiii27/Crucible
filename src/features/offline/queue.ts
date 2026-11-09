// The starts and ends recorded on a phone without network (CR-082, X-21): kept in the phone's browser (localStorage) until the
// network is back, then sent by <OfflineSync>; the server applies them at the instant recorded, with every check of the screen.
// Each record carries the account that recorded it: on a phone shared by a team, a record is only ever sent by the session of
// that account (another one leaves it waiting, and the server refuses it). Browser only; a storage that cannot be read is an
// empty queue.
export interface QueuedEvent {
  bookingId: string;
  kind: 'start' | 'end';
  at: number;
  /** Account that recorded it (the user id of the session that showed My schedule). */
  owner: string;
}

const KEY = 'crucible-offline-v1';
const OWNER_KEY = 'crucible-offline-owner';
export const QUEUE_EVENT = 'crucible-offline-queue';

/** The account of the session showing My schedule: set by <OfflineSync>, written on every record made from then on. */
export function setOwner(owner: string): void {
  try {
    window.localStorage.setItem(OWNER_KEY, owner);
  } catch {
    // No storage: nothing can be queued either.
  }
}

function currentOwner(): string | null {
  try {
    return window.localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

export function readQueue(): QueuedEvent[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? (list as QueuedEvent[]).filter((e) => e && typeof e.bookingId === 'string' && (e.kind === 'start' || e.kind === 'end') && typeof e.at === 'number' && typeof e.owner === 'string')
      : [];
  } catch {
    return [];
  }
}

export function writeQueue(list: QueuedEvent[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(QUEUE_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** Records a start or an end now, for the account showing My schedule; false when the browser cannot keep it. */
export function enqueue(bookingId: string, kind: 'start' | 'end'): boolean {
  const owner = currentOwner();
  if (!owner) return false;
  const list = readQueue().filter((e) => !(e.bookingId === bookingId && e.kind === kind && e.owner === owner));
  list.push({ bookingId, kind, at: Date.now(), owner });
  return writeQueue(list);
}

/** The records of one account. */
export const queueOf = (owner: string) => readQueue().filter((e) => e.owner === owner);

/** True when the browser says it has no network. */
export const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
