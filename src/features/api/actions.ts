'use server';
// Server Functions of the bench systems' API (CR-083, X-17): a facility manager (or the coordinator) of the facility declares a
// client — its token, and the signing secret of its webhook when it has one, are shown once — gives it a new signing secret, or
// revokes it. Audited. A new client starts after the last event (no backlog).
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { checkApiClient } from '@/domain/api';
import { managedFacilities } from '@/domain/rights';
import { lastEventSeq } from '@/server/api';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import { apiClients } from '@/server/db/schema';
import { hashToken, newToken } from '@/server/http/tokens';
import { getViewer } from '@/server/session';

export type ActionResult = { ok: true } | { ok: false; error: string };
/** Secrets shown once: the client's token, and its webhook's signing secret (null without a webhook). */
export type ApiSecrets = { ok: true; token: string | null; webhookSecret: string | null } | { ok: false; error: string };

const REFUSED = { ok: false as const, error: 'This action is not in your workspace' };
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function createApiClientAction(_prev: ApiSecrets | null, fd: FormData): Promise<ApiSecrets> {
  const v = await getViewer();
  const facilityCode = String(fd.get('facilityCode') ?? '');
  if (!managedFacilities(v.role, v.assignments).includes(facilityCode)) return REFUSED;
  const c = checkApiClient({ label: fd.get('label'), webhookUrl: fd.get('webhookUrl') });
  if (!c.ok) return c;
  const token = newToken('cra');
  const webhookSecret = c.value.webhookUrl ? newToken('crw') : null;
  const db = await getDb();
  await db.transaction(async (tx) => {
    const cursor = await lastEventSeq(tx);
    const [row] = await tx.insert(apiClients).values({ facilityCode, label: c.value.label, webhookUrl: c.value.webhookUrl, webhookSecret, tokenHash: hashToken(token), cursor, createdByName: v.name })
      .returning({ id: apiClients.id });
    await writeAudit(tx, {
      actorName: v.name, actorUserId: v.userId, actorRole: v.role, area: 'Facilities', objectRef: `Facility ${facilityCode}`,
      change: `API client added: ${c.value.label}${c.value.webhookUrl ? ` · webhook ${c.value.webhookUrl}` : ''}`, entityType: 'api_client', entityId: row.id,
    });
  });
  revalidatePath(`/facilities/${facilityCode}`);
  return { ok: true, token, webhookSecret };
}

/** A new signing secret for the client's webhook; the old one stops signing at once. */
export async function renewWebhookSecretAction(id: string): Promise<ApiSecrets> {
  if (!isUuid(id)) return REFUSED;
  const v = await getViewer();
  const db = await getDb();
  const secret = newToken('crw');
  let facilityCode = '';
  const r = await db.transaction(async (tx): Promise<ApiSecrets> => {
    const [row] = await tx.select().from(apiClients).where(and(eq(apiClients.id, id), isNull(apiClients.revokedAt)));
    if (!row || !managedFacilities(v.role, v.assignments).includes(row.facilityCode)) return REFUSED;
    if (!row.webhookUrl) return { ok: false, error: 'This system has no webhook' };
    facilityCode = row.facilityCode;
    await tx.update(apiClients).set({ webhookSecret: secret }).where(eq(apiClients.id, id));
    await writeAudit(tx, { actorName: v.name, actorUserId: v.userId, actorRole: v.role, area: 'Facilities', objectRef: `Facility ${row.facilityCode}`, change: `API client webhook secret renewed: ${row.label}`, entityType: 'api_client', entityId: id });
    return { ok: true, token: null, webhookSecret: secret };
  });
  if (r.ok) revalidatePath(`/facilities/${facilityCode}`);
  return r;
}

export async function revokeApiClientAction(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return REFUSED;
  const v = await getViewer();
  const db = await getDb();
  let facilityCode = '';
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [row] = await tx.select().from(apiClients).where(eq(apiClients.id, id));
    if (!row || !managedFacilities(v.role, v.assignments).includes(row.facilityCode)) return REFUSED;
    facilityCode = row.facilityCode;
    if (row.revokedAt) return { ok: true };
    await tx.update(apiClients).set({ revokedAt: new Date(), revokedByName: v.name }).where(eq(apiClients.id, id));
    await writeAudit(tx, { actorName: v.name, actorUserId: v.userId, actorRole: v.role, area: 'Facilities', objectRef: `Facility ${row.facilityCode}`, change: `API client revoked: ${row.label}`, entityType: 'api_client', entityId: id });
    return { ok: true };
  });
  if (r.ok && facilityCode) revalidatePath(`/facilities/${facilityCode}`);
  return r;
}
