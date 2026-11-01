// GET /api/export/<screen>?<the screen's own parameters> — CSV of what the screen shows (delivery 5b, the header's Export).
// The viewer is read again and the screen must be in their workspace (404 otherwise, as for the page); every read applies the
// visibility rules (U-3). Never cached.
import { canSee } from '@/config/screens';
import { csvFileName, toCsv } from '@/lib/csv';
import { businessToday } from '@/server/clock';
import { exportRows, isExportable } from '@/server/export/views';
import { hitRate, tooManyRequests } from '@/server/http/rate-limit';
import { getI18n, getViewer } from '@/server/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ screen: string }> }): Promise<Response> {
  const { screen } = await params;
  const [viewer, { lang }, today] = await Promise.all([getViewer(), getI18n(), businessToday()]);
  if (!isExportable(screen) || !canSee(viewer.role, screen)) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  // CR-079: at most 30 exports per person and 10 minutes.
  const rate = await hitRate('export', viewer.userId, { name: viewer.name, userId: viewer.userId, role: viewer.role });
  if (!rate.ok) return tooManyRequests(rate.retryAfterSec);
  const rows = await exportRows(screen, viewer, new URL(request.url).searchParams, lang, today);
  return new Response(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFileName(screen, today)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
