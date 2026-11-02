// GET /api/v1/resources — the resources of the API client's facility (CR-083, X-17). Authenticated by the client's token
// (Authorization: Bearer cra_…), not by a session. 200 {facility, resources}; 401 unknown or revoked token; 429 too many.
import { apiClientOf, apiJson, apiResources } from '@/server/api';
import { businessNow } from '@/server/clock';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const client = await apiClientOf(request, await businessNow());
  if (client instanceof Response) return client;
  return apiJson(200, { facility: client.facilityCode, resources: await apiResources(client.facilityCode) });
}
