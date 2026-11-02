// GET /api/v1/bookings?from=&to=&resource= — the bookings of the API client's facility overlapping the period (CR-083, X-17):
// `from` and `to` are days (YYYY-MM-DD, `to` included) or ISO 8601 instants, 7 days back to 30 days ahead by default, 186 days at
// most; `resource` is a resource code. Every status; a confidential project masked (project, purpose, operators null).
// 200 {facility, from, to, bookings}; 400 invalid period or unknown resource; 401; 429.
import { apiPeriod } from '@/domain/api';
import { apiBookings, apiClientOf, apiJson, apiResources } from '@/server/api';
import { businessNow } from '@/server/clock';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const now = await businessNow();
  const client = await apiClientOf(request, now);
  if (client instanceof Response) return client;
  const query = new URL(request.url).searchParams;
  const period = apiPeriod(query.get('from'), query.get('to'), now.getTime());
  if (!period.ok) return apiJson(400, { error: period.error });
  const resource = query.get('resource')?.trim() || null;
  if (resource && !(await apiResources(client.facilityCode)).some((r) => r.code === resource)) return apiJson(400, { error: 'Unknown resource in this facility' });
  const bookings = await apiBookings(client.facilityCode, { ...period.value, resourceCode: resource });
  return apiJson(200, { facility: client.facilityCode, from: new Date(period.value.from).toISOString(), to: new Date(period.value.to).toISOString(), bookings });
}
