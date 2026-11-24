import 'server-only';
// User accounts and their role assignments (docs/spec/01 §2, §4). Only valid assignments in force on `today` count.
import { eq, inArray, or } from 'drizzle-orm';
import { sortRoles, type RoleKey } from '@/config/roles';
import { SIGN_IN_REFUSAL_LABEL, decideSignIn, effectiveAssignments, type SignInRefusal } from '@/domain/auth';
import { isValidAssignment, type RoleAssignment } from '@/domain/rights';
import { businessToday } from '@/server/clock';
import { getConfig } from '@/server/config';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import { roleAssignments, users } from '@/server/db/schema';
import type { DB, Tx } from '@/server/db/types';
import { initialsOf, type Viewer } from '@/server/viewer';

type Q = DB | Tx;

export interface UserAccount {
  userId: string;
  email: string;
  displayName: string;
  jobTitle: string | null;
  entityCode: string | null;
  active: boolean;
  entraObjectId: string | null;
  assignments: RoleAssignment[];
  /** Roles of the valid assignments, in priority order. */
  roles: RoleKey[];
}

const inForce = (a: { fromOn: string | null; toOn: string | null }, today: string) => (!a.fromOn || a.fromOn <= today) && (!a.toOn || a.toOn >= today);

async function accountsWhere(q: Q, where: ReturnType<typeof eq>, today: string, granted?: RoleKey[]): Promise<UserAccount[]> {
  const rows = await q.select().from(users).where(where);
  if (!rows.length) return [];
  const assigned = await q.select().from(roleAssignments).where(inArray(roleAssignments.userId, rows.map((r) => r.id)));
  return rows.map((u) => {
    const stored = assigned
      .filter((a) => a.userId === u.id && inForce(a, today))
      .map((a): RoleAssignment => ({ role: a.role, scopeKind: a.scopeKind, scopeRef: a.scopeRef }))
      .filter(isValidAssignment);
    // Central sign-in (Clavis): the roles it granted at the last sign-in rule; Crucible assignments only give their scope.
    // `granted`: the roles just read in clavis.pub_acces (CRUCIBLE_ACCESS_FROM_CLAVIS), instead of those of the last sign-in.
    const assignments = effectiveAssignments(granted ?? u.grantedRoles ?? null, stored);
    return {
      userId: u.id, email: u.email, displayName: u.displayName, jobTitle: u.jobTitle, entityCode: u.entityCode, active: u.active,
      entraObjectId: u.entraObjectId, assignments, roles: sortRoles(assignments.map((a) => a.role)),
    };
  });
}

export async function getUserAccount(userId: string, today: string, q?: Q, granted?: RoleKey[]): Promise<UserAccount | null> {
  return (await accountsWhere(q ?? (await getDb()), eq(users.id, userId), today, granted))[0] ?? null;
}

export async function accountByEmail(email: string, today: string, q?: Q): Promise<UserAccount | null> {
  return (await accountsWhere(q ?? (await getDb()), eq(users.email, email.toLowerCase()), today))[0] ?? null;
}

export async function accountByObjectId(oid: string, today: string, q?: Q): Promise<UserAccount | null> {
  return (await accountsWhere(q ?? (await getDb()), eq(users.entraObjectId, oid), today))[0] ?? null;
}

/** The viewer of an account in `role` (one it holds). */
export function viewerOfAccount(a: UserAccount, role: RoleKey, demo: boolean): Viewer {
  return {
    userId: a.userId, name: a.displayName, email: a.email, title: a.jobTitle ?? '', initials: initialsOf(a.displayName),
    role, roles: a.roles, assignments: a.assignments, entityCode: a.entityCode, demo,
  };
}

export type SignInResult = { ok: true; account: UserAccount } | { ok: false; reason: SignInRefusal };

/**
 * Entra sign-in: the account of the Microsoft object id, else of the e-mail (linked to the object id at its first sign-in),
 * else a new administrator account for an e-mail of CRUCIBLE_ADMIN_EMAILS (N-4). Every outcome is audited.
 */
export async function signInUser(input: { oid: string; email: string | null; name: string | null; granted?: RoleKey[] | null }): Promise<SignInResult> {
  const db = await getDb();
  const today = await businessToday();
  const { adminEmails } = getConfig();
  const granted = input.granted ?? null;
  return db.transaction(async (tx) => {
    // Central sign-in (Clavis): the roles of this token replace the ones granted at the previous sign-in, before deciding.
    if (granted) {
      const [row] = await tx.select({ id: users.id }).from(users).where(input.email ? or(eq(users.entraObjectId, input.oid), eq(users.email, input.email)) : eq(users.entraObjectId, input.oid));
      if (row) await tx.update(users).set({ grantedRoles: granted, updatedAt: new Date() }).where(eq(users.id, row.id));
    }
    const byObjectId = await accountByObjectId(input.oid, today, tx);
    const byEmail = byObjectId || !input.email ? null : await accountByEmail(input.email, today, tx);
    const decision = decideSignIn({ oid: input.oid, email: input.email, byObjectId, byEmail, adminEmails, granted });
    const who = input.email ?? input.oid;
    if (!decision.ok) {
      await writeAudit(tx, { actorName: input.name ?? who, actorUserId: (byObjectId ?? byEmail)?.userId ?? null, objectRef: `User ${who}`, change: `Sign-in refused · ${SIGN_IN_REFUSAL_LABEL[decision.reason]}`, area: 'Sign-in' });
      return { ok: false, reason: decision.reason };
    }
    let userId = decision.userId;
    if (decision.createFromClavis) {
      const [u] = await tx.insert(users).values({ email: input.email!, displayName: input.name?.trim() || input.email!, entraObjectId: input.oid, grantedRoles: granted! }).returning({ id: users.id });
      userId = u.id;
      await writeAudit(tx, { actorName: 'System', actorUserId: null, objectRef: `User ${who}`, change: `Account created at first sign-in through Clavis (${granted!.join(', ')})`, area: 'Sign-in', entityType: 'user', entityId: userId });
    }
    if (decision.createAdmin) {
      const [u] = await tx.insert(users).values({ email: input.email!, displayName: input.name?.trim() || input.email!, entraObjectId: input.oid }).returning({ id: users.id });
      userId = u.id;
      await tx.insert(roleAssignments).values({ userId, role: 'admin', scopeKind: 'global', scopeRef: null, createdByName: 'CRUCIBLE_ADMIN_EMAILS' });
      await writeAudit(tx, { actorName: 'System', actorUserId: null, objectRef: `User ${who}`, change: 'Administrator account created at first sign-in (CRUCIBLE_ADMIN_EMAILS)', area: 'Sign-in', entityType: 'user', entityId: userId });
    }
    await tx.update(users).set({ entraObjectId: input.oid, lastSignInAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId!));
    const account = (await getUserAccount(userId!, today, tx))!;
    await writeAudit(tx, { actorName: account.displayName, actorUserId: account.userId, objectRef: `User ${account.email}`, change: 'Signed in', area: 'Sign-in' });
    return { ok: true, account };
  });
}

/** Audit row of a sign-out. */
export async function recordSignOut(userId: string): Promise<void> {
  const db = await getDb();
  const a = await getUserAccount(userId, await businessToday(), db);
  if (a) await writeAudit(db, { actorName: a.displayName, actorUserId: a.userId, objectRef: `User ${a.email}`, change: 'Signed out', area: 'Sign-in' });
}
