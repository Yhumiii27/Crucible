import 'server-only';
// Notifications (F-8; delivery 5): stored in the transaction of the write that causes them (the bell of the person), then
// e-mailed by the job worker when a transport is set (./mail.ts). Recipients are user accounts: a requester, the managers or
// coordinators of a facility, the R&D director. A person never receives a notification of their own act.
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { NotificationKind } from '@/domain/recovery-vocabulary';
import { notifications, roleAssignments, users } from '@/server/db/schema';
import type { DB, Tx } from '@/server/db/types';

type Q = DB | Tx;

export interface Notice {
  kind: NotificationKind;
  /** EN source text with typed references after " · ". */
  title: string;
  href?: string;
}

/** Stores one notification per recipient (distinct, active accounts, the author excepted). */
export async function notify(q: Q, userIds: readonly (string | null | undefined)[], n: Notice, opts: { except?: string | null; at?: Date } = {}): Promise<number> {
  const ids = [...new Set(userIds.filter((x): x is string => !!x && x !== opts.except))];
  if (!ids.length) return 0;
  const active = await q.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), eq(users.active, true)));
  if (!active.length) return 0;
  const at = opts.at ?? new Date();
  await q.insert(notifications).values(active.map((u) => ({ userId: u.id, kind: n.kind, title: n.title, href: n.href ?? null, createdAt: at })));
  return active.length;
}

/** Accounts holding a role, globally or on one of the facilities given (coordinators and managers of these facilities). */
export async function usersWithRole(q: Q, roles: readonly string[], facilityCodes: readonly string[] = []): Promise<string[]> {
  const rows = await q.select({ userId: roleAssignments.userId }).from(roleAssignments)
    .where(and(inArray(roleAssignments.role, [...roles] as never[]), facilityCodes.length ? or(isNull(roleAssignments.scopeRef), inArray(roleAssignments.scopeRef, [...facilityCodes])) : undefined));
  return [...new Set(rows.map((r) => r.userId))];
}
