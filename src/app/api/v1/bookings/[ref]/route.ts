// GET /api/v1/bookings/<ref> — one booking of the API client's facility (CR-083, X-17). 200 {booking}; 404 unknown here
// (another facility's booking does not exist for the client); 401; 429.
import { apiBookingByRef, apiClientOf, apiJson } from '@/server/api';
import { businessNow } from '@/server/clock';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ ref: string }> }): Promise<Response> {
  const client = await apiClientOf(request, await businessNow());
  if (client instanceof Response) return client;
  const { ref } = await params;
  const booking = /^[A-Za-z0-9-]{1,40}$/.test(ref) ? await apiBookingByRef(client.facilityCode, ref) : null;
  if (!booking) return apiJson(404, { error: 'Unknown booking' });
  return apiJson(200, { booking });
}
