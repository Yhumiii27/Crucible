'use server';
// Server Functions of delivery 4 (docs/spec/01 §3, 02 §4–5, 03 §3–5): people, skills and absences (coordinator and facility
// managers of their facilities, F-7, S-3), Cursus titles read when granted, skill and equipment requirements of the test types,
// mobile equipment (R-8), substitutions (R-4), priority rules (R&D director, A-1), the engine run (R&D director, coordinator,
// F-3), proposals accepted or rejected (managers of the facility: a confirmed booking with its people and equipment, every
// hard constraint checked again), conflicts decided (A-4) or vetoed by the safety officer. Each checks the viewer's active role
// and scope server-side, re-reads what it touches inside its transaction (writes are serialised by the write lock), writes,
// audits and revalidates.
import { and, desc, eq, inArray, like, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { checkBooking, ISSUE_LABEL, type Issue } from '@/domain/booking';
import { canDecide, conflictDueOn } from '@/domain/conflicts';
import { checkAbsence, checkEquipment, checkPerson, checkPersonSkill, checkSkill, checkSubstitution, staffAndEquipmentIssues } from '@/domain/people';
import { isCriteriaOrder } from '@/domain/priority';
import { HOLDING } from '@/domain/resources';
import { canEditSkills, canEditTestTypes, canPublishPriorityRules, canRunEngine, managedFacilities, peopleFacilities } from '@/domain/rights';
import { parisParts } from '@/lib/dates';
import { businessNow, businessToday } from '@/server/clock';
import { citationOf } from '@/server/assistant/service';
import { getDb } from '@/server/db/client';
import { writeAudit } from '@/server/db/helpers';
import {
  arbitrations, bookingEquipment, bookingStaff, bookings, conflicts, entities, mobileEquipment, people,
  personAbsences, personSkills, planRuns, priorityRuleSets, projects, proposals, resources, skills, substitutions, testNeeds, testTypeEquipment, testTypeSkills, testTypes,
} from '@/server/db/schema';
import type { Tx } from '@/server/db/types';
import { currentRuleSet, runEngine } from '@/server/planning/engine-run';
import { slotFacts } from '@/server/planning/slot-facts';
import { notify } from '@/server/notify';
import { getViewer, type Viewer } from '@/server/session';

export type ActionResult = { ok: true; warnings?: string[] } | { ok: false; error: string };

const fieldsOf = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
const audit = (v: Viewer, area: string, objectRef: string, change: string, extra: { entityType?: string; entityId?: string; projectCode?: string; before?: Record<string, unknown>; after?: Record<string, unknown>; reason?: string } = {}) => ({
  actorName: v.name, actorUserId: v.userId, actorRole: v.role, objectRef, change, area, ...extra,
});
const REFUSED: ActionResult = { ok: false, error: 'This action is not in your workspace' };
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const issueText = (i: Issue) => (i.ref ? `${ISSUE_LABEL[i.code]} · ${i.ref}` : ISSUE_LABEL[i.code]);

function revalidate(...paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

// ── People, skills, absences ─────────────────────────────────────────────────────────────────────────────────────────────

/** A person the viewer keeps: one who works in a facility they manage. */
async function keptPerson(tx: Tx, v: Viewer, id: string) {
  if (!isUuid(id)) return null;
  const mine = peopleFacilities(v.role, v.assignments);
  const [p] = await tx.select().from(people).where(eq(people.id, id));
  return p && p.facilityCodes.some((f) => mine.includes(f)) ? p : null;
}

export async function createSkillAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  if (!canEditSkills(v.role)) return { ok: false, error: 'Only the coordinator or the R&D director keeps the skill catalogue' };
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const c = checkSkill(fieldsOf(fd), new Set((await tx.select({ c: skills.code }).from(skills)).map((x) => x.c)));
    if (!c.ok) return c;
    await tx.insert(skills).values(c.value);
    await writeAudit(tx, audit(v, 'People', `Skill ${c.value.code}`, 'skill created', { entityType: 'skill', after: { ...c.value } }));
    return { ok: true };
  });
  if (r.ok) revalidate('/people', '/rules');
  return r;
}

export async function createPersonAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const mine = peopleFacilities(v.role, v.assignments);
  if (!mine.length) return REFUSED;
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [ents, mats] = await Promise.all([tx.select({ c: entities.code }).from(entities), tx.select({ m: people.matricule }).from(people)]);
    const c = checkPerson({ ...fieldsOf(fd), facilityCodes: fd.getAll('facilityCodes').map(String) }, {
      entities: new Set(ents.map((x) => x.c)), facilities: new Set(mine), matricules: new Set(mats.map((x) => x.m).filter((x): x is string => !!x)),
    });
    if (!c.ok) return c;
    const [p] = await tx.insert(people).values({ ...c.value, updatedByName: v.name }).returning({ id: people.id });
    await writeAudit(tx, audit(v, 'People', `Person ${c.value.name}`, 'person added', { entityType: 'person', entityId: p.id, after: { ...c.value } }));
    return { ok: true };
  });
  if (r.ok) revalidate('/people');
  return r;
}

export async function setPersonSkillAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const p = await keptPerson(tx, v, String(fd.get('personId') ?? ''));
    if (!p) return REFUSED;
    const c = checkPersonSkill(fieldsOf(fd), new Set((await tx.select({ c: skills.code }).from(skills).where(eq(skills.active, true))).map((x) => x.c)));
    if (!c.ok) return c;
    const row = { personId: p.id, ...c.value, source: 'crucible', updatedByName: v.name, updatedAt: new Date() };
    await tx.insert(personSkills).values(row).onConflictDoUpdate({ target: [personSkills.personId, personSkills.skillCode], set: row });
    await writeAudit(tx, audit(v, 'People', `Person ${p.name}`, `skill: ${c.value.skillCode}${c.value.validUntil ? ` until ${c.value.validUntil}` : ''}`, { entityType: 'person', entityId: p.id, after: { ...c.value } }));
    return { ok: true };
  });
  if (r.ok) revalidate('/people', '/propose');
  return r;
}

export async function removePersonSkillAction(personId: string, skillCode: string): Promise<ActionResult> {
  const v = await getViewer();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const p = await keptPerson(tx, v, personId);
    if (!p) return REFUSED;
    await tx.delete(personSkills).where(and(eq(personSkills.personId, p.id), eq(personSkills.skillCode, skillCode)));
    await writeAudit(tx, audit(v, 'People', `Person ${p.name}`, `skill removed: ${skillCode}`, { entityType: 'person', entityId: p.id }));
    return { ok: true };
  });
  if (r.ok) revalidate('/people', '/propose');
  return r;
}

export async function addAbsenceAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const c = checkAbsence(fieldsOf(fd));
  if (!c.ok) return c;
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const p = await keptPerson(tx, v, String(fd.get('personId') ?? ''));
    if (!p) return REFUSED;
    await tx.insert(personAbsences).values({ personId: p.id, ...c.value, createdByName: v.name });
    await writeAudit(tx, audit(v, 'People', `Person ${p.name}`, `absent: ${c.value.fromOn} → ${c.value.toOn}`, { entityType: 'person', entityId: p.id, after: { ...c.value } }));
    return { ok: true };
  });
  if (r.ok) revalidate('/people', '/propose');
  return r;
}

export async function removeAbsenceAction(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return REFUSED;
  const v = await getViewer();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [a] = await tx.select().from(personAbsences).where(eq(personAbsences.id, id));
    const p = a ? await keptPerson(tx, v, a.personId) : null;
    if (!a || !p) return REFUSED;
    await tx.delete(personAbsences).where(eq(personAbsences.id, id));
    await writeAudit(tx, audit(v, 'People', `Person ${p.name}`, `absence removed: ${a.fromOn} → ${a.toOn}`, { entityType: 'person', entityId: p.id }));
    return { ok: true };
  });
  if (r.ok) revalidate('/people', '/propose');
  return r;
}

/**
 * Reads the titles of the people from Cursus (S-3) when `cursus.pub_titres_detenus` is granted: for every skill mapped to a
 * Cursus title and every person with a matricule, the title held sets the skill and its last day of use (source `cursus`).
 */
export async function syncCursusSkillsAction(): Promise<ActionResult> {
  const v = await getViewer();
  if (!canEditSkills(v.role)) return { ok: false, error: 'Only the coordinator or the R&D director keeps the skill catalogue' };
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const readable = await tx.execute(sql`
      select coalesce(bool_and(has_schema_privilege(n.oid, 'USAGE') and has_table_privilege(c.oid, 'SELECT')), false) as ok
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'cursus' and c.relname = 'pub_titres_detenus'`);
    if (!(readable.rows[0] as { ok: boolean } | undefined)?.ok) return { ok: false, error: 'The Cursus view of the titles held is not published or not granted to Crucible yet' };
    const [mapped, ppl] = await Promise.all([
      tx.select({ code: skills.code, titre: skills.cursusTitreId }).from(skills).where(eq(skills.active, true)),
      tx.select({ id: people.id, matricule: people.matricule }).from(people).where(eq(people.active, true)),
    ]);
    const titles = mapped.filter((m) => m.titre);
    const mats = ppl.map((p) => p.matricule).filter((m): m is string => !!m);
    if (!titles.length || !mats.length) return { ok: true, warnings: ['0 titles read from Cursus'] };
    const rows = await tx.execute(sql`
      select matricule, titre_id, utilisable_jusqu_au::text as until from cursus.pub_titres_detenus
      where titre_id in (${sql.join(titles.map((t) => sql`${t.titre}`), sql`, `)}) and matricule in (${sql.join(mats.map((m) => sql`${m}`), sql`, `)})`);
    let n = 0;
    for (const row of rows.rows as { matricule: string; titre_id: string; until: string | null }[]) {
      const person = ppl.find((p) => p.matricule === row.matricule)!;
      const skill = titles.find((t) => t.titre === row.titre_id)!;
      const values = { personId: person.id, skillCode: skill.code, validUntil: row.until, source: 'cursus', updatedByName: 'Cursus', updatedAt: new Date() };
      await tx.insert(personSkills).values(values).onConflictDoUpdate({ target: [personSkills.personId, personSkills.skillCode], set: values });
      n++;
    }
    await writeAudit(tx, audit(v, 'People', 'Cursus', `${n} titles read from Cursus`, { after: { count: n } }));
    return { ok: true, warnings: [`${n} titles read from Cursus`] };
  });
  if (r.ok) revalidate('/people', '/propose');
  return r;
}

// ── Test type requirements, mobile equipment ─────────────────────────────────────────────────────────────────────────────

/** Skills (with a count) and equipment a test type asks (F-7, R-8): the coordinator and the R&D director. */
export async function setTestTypeRequirementsAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  if (!canEditTestTypes(v.role)) return { ok: false, error: 'Only the coordinator or the R&D director keeps the test type catalogue' };
  const code = String(fd.get('testTypeCode') ?? '').toUpperCase();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [tt] = await tx.select().from(testTypes).where(eq(testTypes.code, code));
    if (!tt) return { ok: false, error: 'Unknown test type' };
    const [sk, eq_] = await Promise.all([tx.select({ c: skills.code }).from(skills).where(eq(skills.active, true)), tx.select({ c: mobileEquipment.code }).from(mobileEquipment).where(eq(mobileEquipment.active, true))]);
    const knownSkills = new Set(sk.map((x) => x.c));
    const knownEquip = new Set(eq_.map((x) => x.c));
    const asked: { skillCode: string; count: number }[] = [];
    for (const s of fd.getAll('skillCodes').map(String)) {
      const n = Number(fd.get(`count-${s}`) ?? '1');
      if (!knownSkills.has(s) || !Number.isInteger(n) || n < 1 || n > 5) return { ok: false, error: 'Choose skills of the catalogue, from 1 to 5 people each' };
      asked.push({ skillCode: s, count: n });
    }
    const equipment = [...new Set(fd.getAll('equipmentCodes').map(String))];
    if (equipment.some((e) => !knownEquip.has(e))) return { ok: false, error: 'Choose equipment of the list' };
    await tx.delete(testTypeSkills).where(eq(testTypeSkills.testTypeCode, code));
    await tx.delete(testTypeEquipment).where(eq(testTypeEquipment.testTypeCode, code));
    if (asked.length) await tx.insert(testTypeSkills).values(asked.map((a) => ({ testTypeCode: code, ...a })));
    if (equipment.length) await tx.insert(testTypeEquipment).values(equipment.map((equipmentCode) => ({ testTypeCode: code, equipmentCode })));
    await writeAudit(tx, audit(v, 'Rules', `Test type ${code}`, 'requirements set', { entityType: 'test_type', after: { skills: asked, equipment } }));
    return { ok: true };
  });
  if (r.ok) revalidate('/rules', '/propose');
  return r;
}

export async function createEquipmentAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const mine = managedFacilities(v.role, v.assignments);
  if (!mine.length) return REFUSED;
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const c = checkEquipment(fieldsOf(fd), { taken: new Set((await tx.select({ c: mobileEquipment.code }).from(mobileEquipment)).map((x) => x.c)), facilities: new Set(mine) });
    if (!c.ok) return c;
    await tx.insert(mobileEquipment).values({ ...c.value, updatedByName: v.name });
    await writeAudit(tx, audit(v, 'Facilities', `Equipment ${c.value.code}`, 'mobile equipment added', { entityType: 'equipment', after: { ...c.value } }));
    return { ok: true };
  });
  if (r.ok) revalidate(`/facilities/${fd.get('facilityCode')}`, '/rules');
  return r;
}

// ── Substitutions (R-4) ──────────────────────────────────────────────────────────────────────────────────────────────────

export async function proposeSubstitutionAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const mine = managedFacilities(v.role, v.assignments);
  if (!mine.length) return REFUSED;
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [tts, res, subs] = await Promise.all([
      tx.select({ code: testTypes.code, nominal: testTypes.nominalResourceId }).from(testTypes).where(eq(testTypes.active, true)),
      tx.select({ id: resources.id }).from(resources).where(ne(resources.status, 'retired')),
      tx.select({ t: substitutions.testTypeCode, r: substitutions.resourceId }).from(substitutions).where(ne(substitutions.status, 'retired')),
    ]);
    const c = checkSubstitution(fieldsOf(fd), {
      testTypes: new Map(tts.map((x) => [x.code, x.nominal])), resources: new Set(res.map((x) => x.id)), taken: new Set(subs.map((x) => `${x.t}|${x.r}`)),
    });
    if (!c.ok) return c;
    const [s] = await tx.insert(substitutions).values({ ...c.value, proposedByName: v.name })
      .onConflictDoUpdate({ target: [substitutions.testTypeCode, substitutions.resourceId], set: { ...c.value, status: 'proposed', proposedByName: v.name, hostValidatedByName: null, hostValidatedAt: null, safetyValidatedByName: null, safetyValidatedAt: null, retiredReason: null, updatedAt: new Date() } })
      .returning({ id: substitutions.id });
    await writeAudit(tx, audit(v, 'Rules', `Substitution ${c.value.testTypeCode}`, 'substitution proposed', { entityType: 'substitution', entityId: s.id, after: { ...c.value } }));
    return { ok: true };
  });
  if (r.ok) revalidate('/rules');
  return r;
}

/**
 * R-4: the manager of the host facility validates (with the technical referent named and the justification); the safety
 * officer gives the opinion when hazardous matter is involved. The substitution is validated when both are given.
 */
export async function validateSubstitutionAction(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return REFUSED;
  const v = await getViewer();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [row] = await tx.select({ s: substitutions, facilityCode: resources.facilityCode }).from(substitutions).innerJoin(resources, eq(resources.id, substitutions.resourceId)).where(eq(substitutions.id, id));
    if (!row) return REFUSED;
    const s = row.s;
    if (s.status !== 'proposed') return { ok: false, error: 'This substitution is not awaiting validation' };
    const now = new Date();
    const patch: Partial<typeof substitutions.$inferInsert> = { updatedAt: now };
    let step: string;
    if (v.role === 'safety') {
      if (!s.hazardous) return { ok: false, error: 'The safety officer’s opinion is asked for hazardous matter only' };
      if (s.safetyValidatedByName) return { ok: true };
      patch.safetyValidatedByName = v.name;
      patch.safetyValidatedAt = now;
      step = 'safety opinion';
    } else if (managedFacilities(v.role, v.assignments).includes(row.facilityCode)) {
      if (s.hostValidatedByName) return { ok: true };
      patch.hostValidatedByName = v.name;
      patch.hostValidatedAt = now;
      step = 'host facility validation';
    } else return { ok: false, error: 'The manager of the host facility validates a substitution' };
    const host = patch.hostValidatedByName ?? s.hostValidatedByName;
    const safe = !s.hazardous || (patch.safetyValidatedByName ?? s.safetyValidatedByName);
    if (host && safe) patch.status = 'validated';
    await tx.update(substitutions).set(patch).where(eq(substitutions.id, id));
    await writeAudit(tx, audit(v, 'Rules', `Substitution ${s.testTypeCode}`, patch.status ? `${step}: proposed → validated` : step, { entityType: 'substitution', entityId: id }));
    return { ok: true };
  });
  if (r.ok) revalidate('/rules', '/propose');
  return r;
}

export async function retireSubstitutionAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const id = String(fd.get('substitutionId') ?? '');
  const reason = String(fd.get('reason') ?? '').trim();
  if (!isUuid(id)) return REFUSED;
  if (reason.length < 3) return { ok: false, error: 'Give the reason' };
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [row] = await tx.select({ s: substitutions, facilityCode: resources.facilityCode }).from(substitutions).innerJoin(resources, eq(resources.id, substitutions.resourceId)).where(eq(substitutions.id, id));
    if (!row) return REFUSED;
    if (v.role !== 'safety' && !managedFacilities(v.role, v.assignments).includes(row.facilityCode)) return REFUSED;
    if (row.s.status === 'retired') return { ok: true };
    await tx.update(substitutions).set({ status: 'retired', retiredReason: reason, updatedAt: new Date() }).where(eq(substitutions.id, id));
    await writeAudit(tx, audit(v, 'Rules', `Substitution ${row.s.testTypeCode}`, `status: ${row.s.status} → retired`, { entityType: 'substitution', entityId: id, reason }));
    return { ok: true };
  });
  if (r.ok) revalidate('/rules', '/propose');
  return r;
}

// ── Priority rules (A-1, A-2) ────────────────────────────────────────────────────────────────────────────────────────────

export async function publishPriorityRulesAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  if (!canPublishPriorityRules(v.role)) return { ok: false, error: 'Only the R&D director publishes the priority rules' };
  const criteria = [1, 2, 3, 4, 5, 6].map((i) => String(fd.get(`criterion${i}`) ?? ''));
  if (!isCriteriaOrder(criteria)) return { ok: false, error: 'Give each criterion one rank' };
  const note = String(fd.get('note') ?? '').trim().slice(0, 500) || null;
  const now = await businessNow();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const cur = await currentRuleSet(tx);
    const [exists] = await tx.select({ v: priorityRuleSets.version }).from(priorityRuleSets).orderBy(desc(priorityRuleSets.version)).limit(1);
    const version = exists ? cur.version + 1 : 2;
    if (!exists) await tx.insert(priorityRuleSets).values({ version: 1, criteria: cur.criteria, note: 'Starting order (A-2)', publishedByName: 'Crucible', publishedAt: now });
    await tx.insert(priorityRuleSets).values({ version, criteria, note, publishedByName: v.name, publishedAt: now });
    await writeAudit(tx, audit(v, 'Rules', `Priority rules v${version}`, 'priority rules published', { before: { criteria: cur.criteria }, after: { criteria, note } }));
    return { ok: true };
  });
  if (r.ok) revalidate('/rules', '/propose', '/conflicts');
  return r;
}

// ── Engine, proposals ────────────────────────────────────────────────────────────────────────────────────────────────────

export async function runEngineAction(): Promise<ActionResult> {
  const v = await getViewer();
  if (!canRunEngine(v.role)) return { ok: false, error: 'Only the R&D director or the coordinator runs the engine' };
  const [today, now] = await Promise.all([businessToday(), businessNow()]);
  const db = await getDb();
  const r = await db.transaction(async (tx) => runEngine(tx, { trigger: 'manual', by: { name: v.name, userId: v.userId, role: v.role }, today, now }));
  revalidate('/propose', '/conflicts', '/my/needs', '/');
  return { ok: true, warnings: [`Run ${r.ref}`, `${r.result.proposals.length} proposals`, `${r.conflicts} conflicts`] };
}

async function nextBookingRef(tx: Tx, year: string): Promise<string> {
  const [last] = await tx.select({ ref: bookings.ref }).from(bookings).where(like(bookings.ref, `B-${year}-%`)).orderBy(desc(bookings.ref)).limit(1);
  const n = last ? Number(last.ref.slice(7)) + 1 : 1;
  return `B-${year}-${String(n).padStart(4, '0')}`;
}

/**
 * Accepts proposals of the latest run (F-3: confirmation is human, by batch if need be): each becomes a confirmed booking of
 * its need, with its people and equipment, after every hard constraint is checked again against what holds now. A manager of
 * the facility of each proposal. Proposals that no longer fit are refused one by one, the others accepted.
 */
export async function acceptProposalsAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const mine = managedFacilities(v.role, v.assignments);
  if (!mine.length) return REFUSED;
  const ids = [...new Set(fd.getAll('proposalIds').map(String))].filter(isUuid);
  if (!ids.length) return { ok: false, error: 'Choose the proposals to accept' };
  const now = await businessNow();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [latest] = await tx.select({ id: planRuns.id, ref: planRuns.ref }).from(planRuns).orderBy(desc(planRuns.runAt)).limit(1);
    const rows = await tx.select({ p: proposals, n: testNeeds, entityCode: projects.entityCode, facilityCode: resources.facilityCode }).from(proposals)
      .innerJoin(testNeeds, eq(testNeeds.id, proposals.needId)).innerJoin(projects, eq(projects.code, testNeeds.projectCode))
      .innerJoin(resources, eq(resources.id, proposals.resourceId)).where(inArray(proposals.id, ids));
    const refused: string[] = [];
    let accepted = 0;
    for (const row of rows) {
      const p = row.p;
      if (!latest || p.runId !== latest.id || p.status !== 'proposed' || !mine.includes(row.facilityCode)) {
        refused.push(`${row.n.ref} · Not a proposal of the latest run you may accept`);
        continue;
      }
      const slot = { start: p.startsAt.getTime(), end: p.endsAt.getTime() };
      const { res, ctx } = await slotFacts(tx, p.resourceId, slot);
      const check = checkBooking(slot, { ...ctx, now: now.getTime(), noticeWorkdays: null });
      const personIds = p.staff.map((s) => s.personId);
      const [ppl, sk, abs, busyStaff, busyEquip] = await Promise.all([
        personIds.length ? tx.select().from(people).where(and(inArray(people.id, personIds), eq(people.active, true))) : [],
        personIds.length ? tx.select().from(personSkills).where(inArray(personSkills.personId, personIds)) : [],
        personIds.length ? tx.select().from(personAbsences).where(inArray(personAbsences.personId, personIds)) : [],
        personIds.length
          ? tx.select({ personId: bookingStaff.personId, start: bookings.startsAt, end: bookings.endsAt }).from(bookingStaff).innerJoin(bookings, eq(bookings.id, bookingStaff.bookingId))
            .where(and(inArray(bookingStaff.personId, personIds), inArray(bookings.status, [...HOLDING])))
          : [],
        p.equipment.length
          ? tx.select({ code: bookingEquipment.equipmentCode, start: bookings.startsAt, end: bookings.endsAt }).from(bookingEquipment).innerJoin(bookings, eq(bookings.id, bookingEquipment.bookingId))
            .where(and(inArray(bookingEquipment.equipmentCode, p.equipment), inArray(bookings.status, [...HOLDING])))
          : [],
      ]);
      const issues = [
        ...check.errors.map(issueText),
        ...staffAndEquipmentIssues({ ...slot, firstDay: parisParts(p.startsAt).iso, lastDay: parisParts(new Date(slot.end - 1)).iso }, p.staff, p.equipment, {
          people: new Map(ppl.map((x) => [x.id, { name: x.name, skills: sk.filter((s) => s.personId === x.id).map((s) => ({ code: s.skillCode, validUntil: s.validUntil })), absences: abs.filter((a) => a.personId === x.id) }])),
          staffBusy: busyStaff.map((b) => ({ personId: b.personId, start: b.start.getTime(), end: b.end.getTime() })),
          equipmentBusy: busyEquip.map((b) => ({ code: b.code, start: b.start.getTime(), end: b.end.getTime() })),
        }),
      ];
      if (row.n.status !== 'open') issues.push('This need has been withdrawn');
      if (issues.length) {
        refused.push(`${row.n.ref} · ${issues.join(' — ')}`);
        continue;
      }
      const ref = await nextBookingRef(tx, parisParts(p.startsAt).iso.slice(0, 4));
      const [b] = await tx.insert(bookings).values({
        ref, resourceId: p.resourceId, projectCode: row.n.projectCode, entityCode: row.entityCode, title: row.n.title, startsAt: p.startsAt, endsAt: p.endsAt,
        setupMinutes: res.setupMinutes, teardownMinutes: res.teardownMinutes, status: 'confirmed', requestedByUserId: row.n.requestedByUserId, requestedByName: row.n.requestedByName,
        requestedAt: row.n.requestedAt, confirmedByName: v.name, confirmedAt: now, needId: row.n.id,
        operators: ppl.map((x) => x.name).join(', ') || null,
      }).returning({ id: bookings.id });
      if (p.staff.length) await tx.insert(bookingStaff).values(p.staff.map((s) => ({ bookingId: b.id, personId: s.personId, skillCode: s.skillCode })));
      if (p.equipment.length) await tx.insert(bookingEquipment).values(p.equipment.map((equipmentCode) => ({ bookingId: b.id, equipmentCode })));
      await tx.update(proposals).set({ status: 'accepted', bookingId: b.id, decidedByName: v.name, decidedAt: now }).where(eq(proposals.id, p.id));
      await writeAudit(tx, audit(v, 'Bookings', `Booking ${ref}`, `confirmed from proposal of run ${latest.ref}: ${res.code}${p.substitute ? ' (validated substitute)' : ''}`, {
        entityType: 'booking', entityId: b.id, projectCode: row.n.projectCode,
        after: { need: row.n.ref, resource: res.code, start: p.startsAt.toISOString(), end: p.endsAt.toISOString(), staff: p.staff, equipment: p.equipment, explanation: p.explanation },
      }));
      await notify(tx, [row.n.requestedByUserId], { kind: 'booking_confirmed', title: `Booking confirmed · ${ref} · ${row.n.ref}`, href: `/projects/${encodeURIComponent(row.n.projectCode)}` }, { except: v.userId, at: now });
      accepted++;
    }
    if (!accepted) return { ok: false, error: refused.join(' — ') || 'Choose the proposals to accept' };
    return { ok: true, warnings: [`${accepted} bookings confirmed`, ...refused] };
  });
  if (r.ok) revalidate('/propose', '/planning', '/my/needs', '/my/schedule', '/load', '/');
  return r;
}

export async function rejectProposalAction(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return REFUSED;
  const v = await getViewer();
  const now = await businessNow();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [row] = await tx.select({ p: proposals, facilityCode: resources.facilityCode, needRef: testNeeds.ref, projectCode: testNeeds.projectCode }).from(proposals)
      .innerJoin(resources, eq(resources.id, proposals.resourceId)).innerJoin(testNeeds, eq(testNeeds.id, proposals.needId)).where(eq(proposals.id, id));
    if (!row || !managedFacilities(v.role, v.assignments).includes(row.facilityCode)) return REFUSED;
    if (row.p.status !== 'proposed') return { ok: false, error: 'This proposal is no longer open' };
    await tx.update(proposals).set({ status: 'rejected', decidedByName: v.name, decidedAt: now }).where(eq(proposals.id, id));
    await writeAudit(tx, audit(v, 'Planning', `Need ${row.needRef}`, 'proposal rejected', { entityType: 'proposal', entityId: id, projectCode: row.projectCode }));
    return { ok: true };
  });
  if (r.ok) revalidate('/propose');
  return r;
}

// ── Conflicts (A-4, A-6) ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Decides a conflict: the option chosen, the rule invoked, the reason. The next run serves the needs in that order. */
export async function decideConflictAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  const id = String(fd.get('conflictId') ?? '');
  const optionKey = String(fd.get('optionKey') ?? '');
  const reason = String(fd.get('reason') ?? '').trim();
  if (!isUuid(id)) return REFUSED;
  if (reason.length < 5) return { ok: false, error: 'Give the reason of the decision' };
  const now = await businessNow();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [c] = await tx.select().from(conflicts).where(eq(conflicts.id, id));
    if (!c) return REFUSED;
    if (!canDecide(v.role, c.decider)) return { ok: false, error: c.decider === 'rd_director' ? 'An option delays a critical need: the R&D director decides' : 'Only the coordinator or the R&D director decides a conflict' };
    if (c.status !== 'open' && c.status !== 'vetoed') return { ok: false, error: 'This conflict is no longer open' };
    const option = (c.options as { key: string; order: string[] }[]).find((o) => o.key === optionKey);
    if (!option) return { ok: false, error: 'Choose one of the options' };
    const ruleInvoked = optionKey === c.recommendedKey ? `recommended · ${c.ruleCited}` : c.ruleCited;
    await tx.insert(arbitrations).values({ conflictId: id, kind: 'decision', optionKey, order: option.order, ruleInvoked, reason, decidedByName: v.name, decidedByRole: v.role, decidedAt: now });
    await tx.update(conflicts).set({ status: 'decided', updatedAt: new Date() }).where(eq(conflicts.id, id));
    // Minutes drafted by the assistant (spec 04 §2): the audit row cites the exchange; the decider chose and signed.
    const assistant = await citationOf(tx, v, String(fd.get('assistantTurn') ?? ''));
    await writeAudit(tx, audit(v, 'Planning', `Conflict ${c.ref}`, `decided: ${optionKey}${assistant ? ` · prepared with the assistant · ${assistant}` : ''}`, { entityType: 'conflict', entityId: id, reason, after: { optionKey, order: option.order, ruleInvoked, ...(assistant ? { assistant } : {}) } }));
    return { ok: true };
  });
  if (r.ok) revalidate('/conflicts', '/propose');
  return r;
}

/** The safety officer's veto (A-4): the decision no longer applies; the conflict is to arbitrate again. */
export async function vetoConflictAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const v = await getViewer();
  if (v.role !== 'safety') return { ok: false, error: 'Only the safety officer vetoes a decision' };
  const id = String(fd.get('conflictId') ?? '');
  const reason = String(fd.get('reason') ?? '').trim();
  if (!isUuid(id)) return REFUSED;
  if (reason.length < 5) return { ok: false, error: 'Give the reason of the veto' };
  const now = await businessNow();
  const db = await getDb();
  const r = await db.transaction(async (tx): Promise<ActionResult> => {
    const [c] = await tx.select().from(conflicts).where(eq(conflicts.id, id));
    if (!c) return REFUSED;
    if (c.status !== 'decided') return { ok: false, error: 'Only a decision can be vetoed' };
    await tx.insert(arbitrations).values({ conflictId: id, kind: 'veto', ruleInvoked: 'safety veto', reason, decidedByName: v.name, decidedByRole: v.role, decidedAt: now });
    await tx.update(conflicts).set({ status: 'vetoed', dueOn: conflictDueOn(parisParts(now).iso), updatedAt: new Date() }).where(eq(conflicts.id, id));
    await writeAudit(tx, audit(v, 'Planning', `Conflict ${c.ref}`, 'decision vetoed by the safety officer', { entityType: 'conflict', entityId: id, reason }));
    return { ok: true };
  });
  if (r.ok) revalidate('/conflicts', '/propose');
  return r;
}
