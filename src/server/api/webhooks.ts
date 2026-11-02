import 'server-only';
// Webhooks of the bench systems (CR-083, X-17): each active client with an address receives the events of its facility, one
// POST per event, in order, at least once (the receiver ignores an `id` it already has). Signed: header
// `X-Crucible-Signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<body>">` with the client's secret, `X-Crucible-Timestamp`
// in seconds (the receiver refuses an old one). A failure stops the client's run there; the next attempt waits 1, 2, 4… up to
// 60 minutes. Redirects are not followed; 10 s per request. Run every minute by the job worker (`api-webhooks`).
import { createHmac } from 'node:crypto';
import { and, eq, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { API_EVENTS_PAGE, deliveryError, retryDelayMin } from '@/domain/api';
import { apiClients } from '@/server/db/schema';
import type { DB } from '@/server/db/types';
import { log } from '@/server/log';
import { apiEventsAfter, lastEventSeq } from './index';

/** The signature of a body sent at `timestamp` (seconds). */
export function webhookSignature(secret: string, timestamp: number, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex')}`;
}

export interface DeliveryRun {
  clients: number;
  delivered: number;
  failed: number;
}

/** Delivers the pending events of every client due now. */
export async function deliverWebhooks(db: DB, now = new Date(), fetchImpl: typeof fetch = fetch): Promise<DeliveryRun> {
  const due = await db.select().from(apiClients)
    .where(and(isNull(apiClients.revokedAt), isNotNull(apiClients.webhookUrl), isNotNull(apiClients.webhookSecret), or(isNull(apiClients.nextAttemptAt), lte(apiClients.nextAttemptAt, now))));
  const run: DeliveryRun = { clients: due.length, delivered: 0, failed: 0 };
  for (const c of due) {
    // The last event before reading: the cursor moves past the other facilities' events up to it, never beyond.
    const top = await lastEventSeq(db);
    const events = await apiEventsAfter(c.facilityCode, c.cursor, API_EVENTS_PAGE, db);
    let cursor = c.cursor;
    let error: string | null = null;
    for (const e of events) {
      const body = JSON.stringify(e);
      const ts = Math.floor(now.getTime() / 1000);
      try {
        const res = await fetchImpl(c.webhookUrl!, {
          method: 'POST',
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'User-Agent': 'Crucible-Webhook/1',
            'X-Crucible-Event': e.type,
            'X-Crucible-Delivery': String(e.id),
            'X-Crucible-Timestamp': String(ts),
            'X-Crucible-Signature': webhookSignature(c.webhookSecret!, ts, body),
          },
          body,
        });
        error = deliveryError(res.status);
      } catch (err) {
        error = err instanceof Error && err.name === 'TimeoutError' ? 'Timeout (10 s)' : `Network: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200);
      }
      if (error) break;
      cursor = e.id;
      run.delivered++;
    }
    // Everything of this facility up to `top` was read: skip the other facilities' events too.
    if (!error && events.length < API_EVENTS_PAGE) cursor = Math.max(cursor, top);
    if (error) {
      run.failed++;
      const failures = c.failures + 1;
      log.warn('Webhook delivery failed', { component: 'api-webhooks', client: c.id, failures, error });
      await db.transaction(async (tx) => {
        await tx.update(apiClients).set({ cursor, failures, lastError: error, nextAttemptAt: new Date(now.getTime() + retryDelayMin(failures) * 60_000), ...(cursor > c.cursor ? { lastDeliveryAt: now } : {}) })
          .where(eq(apiClients.id, c.id));
      });
    } else if (cursor !== c.cursor || c.failures || c.lastError) {
      await db.transaction(async (tx) => {
        await tx.update(apiClients).set({ cursor, failures: 0, lastError: null, nextAttemptAt: null, ...(events.length ? { lastDeliveryAt: now } : {}) }).where(eq(apiClients.id, c.id));
      });
    }
  }
  return run;
}
