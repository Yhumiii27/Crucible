'use client';
// Sends the starts and ends recorded without network (CR-082, X-21) as soon as the network is back (and when the page opens), and
// says what is waiting and what the server refused. Mounted on My schedule.
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { syncOfflineEventsAction } from '@/features/resources/actions';
import { useI18n } from '@/i18n/client';
import { QUEUE_EVENT, offline, queueOf, readQueue, setOwner, writeQueue } from './queue';

/** The queue and the network state change on these events. */
function subscribe(changed: () => void) {
  for (const e of ['online', 'offline', 'storage', QUEUE_EVENT]) window.addEventListener(e, changed);
  return () => {
    for (const e of ['online', 'offline', 'storage', QUEUE_EVENT]) window.removeEventListener(e, changed);
  };
}

/** `owner`: the account of the session (its user id): only its own records are counted and sent. */
export function OfflineSync({ owner }: { owner: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [refused, setRefused] = useState<string[]>([]);
  const waiting = useSyncExternalStore(subscribe, () => queueOf(owner).length, () => 0);
  const isOffline = useSyncExternalStore(subscribe, offline, () => false);
  const busy = useRef(false);

  const send = useCallback(async () => {
    const list = queueOf(owner);
    if (!list.length || offline() || busy.current) return;
    busy.current = true;
    try {
      const results = await syncOfflineEventsAction(list);
      // Every record answered is done with (applied or refused for good); the rest waits.
      const answered = new Set(results.map((r) => `${r.bookingId}|${r.kind}`));
      const left = readQueue().filter((e) => e.owner !== owner || !answered.has(`${e.bookingId}|${e.kind}`) || !list.some((x) => x.bookingId === e.bookingId && x.kind === e.kind && x.at === e.at));
      writeQueue(left);
      setRefused(results.filter((r) => !r.ok).map((r) => r.error ?? ''));
      if (results.some((r) => r.ok)) router.refresh();
    } catch {
      // Still no server: kept for the next time.
    } finally {
      busy.current = false;
    }
  }, [router, owner]);

  useEffect(() => {
    setOwner(owner);
    const online = () => void send();
    // Once the page is shown, then each time the network comes back.
    const first = window.setTimeout(online, 0);
    window.addEventListener('online', online);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener('online', online);
    };
  }, [send, owner]);

  if (!waiting && !refused.length && !isOffline) return null;
  return (
    <div role="status" className="text-muted" style={{ fontSize: 13 }}>
      {isOffline && <div>{t('No network: starts and ends are kept on this phone and sent when the network is back.')}</div>}
      {waiting > 0 && <div>{`${waiting} ${t('recorded offline, waiting for the network')}`}</div>}
      {refused.map((e, i) => <div key={i} role="alert">{`${t('Not applied')} : ${t(e)}`}</div>)}
    </div>
  );
}
