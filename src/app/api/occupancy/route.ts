// POST /api/occupancy — an event of an occupancy device (CR-071, X-8): a bench PC agent, an interlock or a badge reader says
// that its resource starts or stops working. Authenticated by the device's token (Authorization: Bearer crd_…), not by a
// session; the token opens this route for its own resource only. Body: {"event": "start" | "stop", "at"?: ISO 8601 instant}.
// 200 {outcome, booking, reason, at}; 400 invalid body; 401 unknown or revoked token. Never cached.
import { clientAddress } from '@/domain/rate-limit';
import { businessNow } from '@/server/clock';
import { hitRate } from '@/server/http/rate-limit';
import { bearerOf, readToken } from '@/server/http/tokens';
import { recordOccupancyEvent } from '@/server/occupancy';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } as const;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: HEADERS });

export async function POST(request: Request): Promise<Response> {
  // CR-079: at most 600 events per address and 10 minutes.
  const rate = await hitRate('device', clientAddress(request.headers.get('x-forwarded-for'), request.headers.get('x-real-ip')), { name: 'Occupancy device', userId: null, role: null });
  if (!rate.ok) return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { ...HEADERS, 'Retry-After': String(rate.retryAfterSec) } });
  const token = readToken(bearerOf(request.headers.get('authorization')), 'crd');
  if (!token) return json(401, { error: 'A device token is required (Authorization: Bearer crd_…)' });
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return json(400, { error: 'The body is too long' });
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json(400, { error: 'The body must be a JSON object' });
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: 'The body must be a JSON object' });
  }
  const r = await recordOccupancyEvent(token, { kind: body.event, at: body.at }, await businessNow());
  if (!r.ok) return json(r.status, { error: r.error });
  return json(200, { outcome: r.outcome, booking: r.bookingRef, reason: r.reason, at: r.at });
}
