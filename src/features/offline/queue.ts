// The starts and ends recorded on a phone without network (CR-082, X-21): kept in the phone's browser (localStorage) until the
// network is back, then sent by <OfflineSync>; the server applies them at the instant recorded, with every check of the screen.
// Browser only; a storage that cannot be read is an empty queue.
export interface QueuedEvent {
  bookingId: string;
  kind: 'start' | 'end';
  at: number;
}

const KEY = 'crucible-offline-v1';
export const QUEUE_EVENT = 'crucible-offline-queue';

export function readQueue(): QueuedEvent[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as QueuedEvent[]).filter((e) => e && typeof e.bookingId === 'string' && (e.kind === 'start' || e.kind === 'end') && typeof e.at === 'number') : [];
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

/** Records a start or an end now; false when the browser cannot keep it. */
export function enqueue(bookingId: string, kind: 'start' | 'end'): boolean {
  const list = readQueue().filter((e) => !(e.bookingId === bookingId && e.kind === kind));
  list.push({ bookingId, kind, at: Date.now() });
  return writeQueue(list);
}

/** True when the browser says it has no network. */
export const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
