// GET /api/calendar/<token>.ics — a calendar subscription (CR-072, X-9) that Outlook (and so Teams) reads every hour: the
// person's tests or one resource, with the person's rights read again at every request (U-3). The secret token of the address
// is the credential (no session); an unknown or revoked one answers 404. Never cached by a proxy.
import { clientAddress } from '@/domain/rate-limit';
import { businessNow, businessToday } from '@/server/clock';
import { calendarFeed } from '@/server/calendar';
import { getConfig } from '@/server/config';
import { hitRate, tooManyRequests } from '@/server/http/rate-limit';
import { readToken } from '@/server/http/tokens';

export const dynamic = 'force-dynamic';

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  // CR-079: at most 120 reads per address and 10 minutes (Outlook reads once an hour).
  const rate = await hitRate('calendar', clientAddress(request.headers.get('x-forwarded-for'), request.headers.get('x-real-ip')), { name: 'Calendar subscription', userId: null, role: null });
  if (!rate.ok) return tooManyRequests(rate.retryAfterSec);
  const { token: raw } = await params;
  const token = readToken(raw.replace(/\.ics$/i, ''), 'crc');
  if (!token) return notFound();
  const [now, today] = await Promise.all([businessNow(), businessToday()]);
  const ics = await calendarFeed(token, now, today, getConfig().publicUrl);
  if (ics == null) return notFound();
  return new Response(ics, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="crucible.ics"', 'Cache-Control': 'private, no-store' },
  });
}
