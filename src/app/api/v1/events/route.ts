// GET /api/v1/events?after=<id> — the events of the API client's facility after the given one, oldest first, 100 at most
// (CR-083, X-17): for a bench system that cannot receive a webhook, the same events, read at its own pace. Each event carries
// the booking or the incident as it is now. 200 {facility, events, next}: call again with after=next until events is empty;
// 400 invalid cursor; 401; 429.
import { eventCursor } from '@/domain/api';
import { apiClientOf, apiEventsAfter, apiJson } from '@/server/api';
import { businessNow } from '@/server/clock';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const client = await apiClientOf(request, await businessNow());
  if (client instanceof Response) return client;
  const after = eventCursor(new URL(request.url).searchParams.get('after'));
  if (after == null) return apiJson(400, { error: 'after: the id of the last event read (a whole number)' });
  const events = await apiEventsAfter(client.facilityCode, after);
  return apiJson(200, { facility: client.facilityCode, events, next: events.at(-1)?.id ?? after });
}
