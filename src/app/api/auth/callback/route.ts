// GET /api/auth/callback — the redirect URI registered in Entra ID: completes the sign-in (404 in demo mode).
import type { NextRequest } from 'next/server';
import { clientAddress } from '@/domain/rate-limit';
import { handleCallback } from '@/server/auth/routes';
import { hitRate, tooManyRequests } from '@/server/http/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  // CR-079: at most 30 sign-in steps per address and 10 minutes.
  const rate = await hitRate('sign_in', clientAddress(request.headers.get('x-forwarded-for'), request.headers.get('x-real-ip')), { name: 'Anonymous', userId: null, role: null });
  if (!rate.ok) return tooManyRequests(rate.retryAfterSec);
  return handleCallback(request);
}
