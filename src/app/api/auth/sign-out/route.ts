// POST /api/auth/sign-out — ends the Crucible and Microsoft sessions (404 in demo mode). POST only: a link or an
// image on another site cannot sign the user out.
import type { NextRequest } from 'next/server';
import { handleSignOut } from '@/server/auth/routes';

export const dynamic = 'force-dynamic';

export function POST(request: NextRequest): Promise<Response> {
  return handleSignOut(request);
}
