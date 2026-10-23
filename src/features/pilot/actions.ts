'use server';
// The pilot's settings (docs/PILOTE.md; decisions P-3, P-6: the R&D direction carries Crucible): its first day, its length,
// its facilities and the weeks of the reference measure (X-2). The R&D director only; checked server-side, audited, stored in
// app_settings.
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { checkPilotSettings, PILOT_SETTING_KEY } from '@/domain/pilot';
import { businessToday } from '@/server/clock';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import { appSettings } from '@/server/db/schema';
import { activeFacilities } from '@/server/dal/pilot';
import { getViewer } from '@/server/session';

export type ActionResult = { ok: true; warnings?: string[] } | { ok: false; error: string };

export async function setPilotAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  if (v.role !== 'rd_director') return { ok: false, error: 'Only the R&D director sets the pilot' };
  const today = await businessToday();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const facs = new Set((await activeFacilities(tx)).map((f) => f.code));
    const c = checkPilotSettings({
      startOn: fd.get('startOn'), weeks: fd.get('weeks'), baselineWeeks: fd.get('baselineWeeks'), facilities: fd.getAll('facilities').map(String),
    }, { facilities: facs, today });
    if (!c.ok) return c;
    const [before] = await tx.select({ v: appSettings.value }).from(appSettings).where(eq(appSettings.key, PILOT_SETTING_KEY));
    const now = new Date();
    await tx.insert(appSettings).values({ key: PILOT_SETTING_KEY, value: c.value, updatedAt: now, updatedByName: v.name })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: c.value, updatedAt: now, updatedByName: v.name } });
    await writeAudit(tx, {
      actorName: v.name, actorUserId: v.userId, actorRole: v.role, objectRef: 'Pilot', area: 'Pilot',
      change: `pilot set: ${c.value.startOn} · ${c.value.weeks} weeks · ${c.value.facilities.join(', ')}`,
      before: (before?.v as Record<string, unknown> | undefined) ?? null, after: { ...c.value },
    });
    return { ok: true };
  });
  if (r.ok) for (const p of ['/pilot', '/dashboard']) revalidatePath(p);
  return r;
}
