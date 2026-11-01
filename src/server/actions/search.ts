'use server';
// Global search of the page header (Keystone's header, delivery 5b): facilities, resources, projects, test needs, bookings,
// incidents, scenarios and conflicts by reference or name — only what the viewer sees (U-3: a booking or a need of a project
// the viewer may not see is found by its reference only, without its purpose). At most 12 hits.
import { and, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { canSee } from '@/config/screens';
import { mondayOf } from '@/domain/calendar';
import { canSeeBookingDetail } from '@/domain/rights';
import { dataText } from '@/i18n/data-text';
import { parisParts } from '@/lib/dates';
import { getDb } from '@/server/db/client';
import { bookings, conflicts, incidents, projects, resources, scenarios, testNeeds } from '@/server/db/schema';
import { visibleFacilities, visibleProjects } from '@/server/dal/visibility';
import { hitRate } from '@/server/http/rate-limit';
import { getI18n, getViewer } from '@/server/session';

export interface SearchHit {
  /** EN source string (translated by the client). */
  kind: string;
  /** Typed text or reference, shown as is. */
  title: string;
  sub: string;
  href: string;
}

const LIMIT = 12;

export async function searchAction(raw: unknown): Promise<SearchHit[]> {
  const q = typeof raw === 'string' ? raw.trim().slice(0, 80) : '';
  if (q.length < 2) return [];
  const [viewer, { lang }] = await Promise.all([getViewer(), getI18n()]);
  // CR-079: at most 120 searches per person and minute; past it, no hit.
  if (!(await hitRate('search', viewer.userId, { name: viewer.name, userId: viewer.userId, role: viewer.role })).ok) return [];
  if (viewer.role === 'admin') return [];
  const db = await getDb();
  const needle = q.toLowerCase();
  const has = (...xs: (string | null | undefined)[]) => xs.some((x) => !!x && x.toLowerCase().includes(needle));
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const hits: SearchHit[] = [];

  const facs = canSee(viewer.role, 'facility') ? await visibleFacilities(viewer) : [];
  for (const f of facs) if (has(f.code, f.name)) hits.push({ kind: 'Facility', title: `${f.code} · ${dataText(f.name, lang)}`, sub: dataText(f.siteName, lang), href: `/facilities/${encodeURIComponent(f.code)}` });
  const codes = facs.map((f) => f.code);
  const res = codes.length ? await db.select().from(resources).where(and(inArray(resources.facilityCode, codes), or(ilike(resources.code, like), ilike(resources.name, like)))).limit(LIMIT) : [];
  for (const r of res) hits.push({ kind: 'Resource', title: `${r.code} · ${dataText(r.name, lang)}`, sub: r.facilityCode, href: `/facilities/${encodeURIComponent(r.facilityCode)}` });

  const projs = canSee(viewer.role, 'project') ? await visibleProjects(viewer) : [];
  for (const p of projs) if (has(p.code, p.name)) hits.push({ kind: 'Project', title: `${p.code} · ${dataText(p.name, lang)}`, sub: p.entityCode, href: `/projects/${encodeURIComponent(p.code)}` });
  const projOf = new Map((await db.select({ code: projects.code, entityCode: projects.entityCode, confidential: projects.confidential }).from(projects)).map((p) => [p.code, p]));

  if (projs.length) {
    const needs = await db.select().from(testNeeds).where(and(inArray(testNeeds.projectCode, projs.map((p) => p.code)), or(ilike(testNeeds.ref, like), ilike(testNeeds.title, like)))).limit(LIMIT);
    for (const n of needs) hits.push({ kind: 'Test need', title: `${n.ref} · ${dataText(n.title, lang)}`, sub: n.projectCode, href: `/projects/${encodeURIComponent(n.projectCode)}` });
  }

  if (codes.length && /\d/.test(q)) {
    const bk = await db.select({ b: bookings, facilityCode: resources.facilityCode, resourceCode: resources.code }).from(bookings).innerJoin(resources, eq(resources.id, bookings.resourceId))
      .where(and(inArray(resources.facilityCode, codes), ilike(bookings.ref, like))).limit(LIMIT);
    for (const { b, facilityCode, resourceCode } of bk) {
      const p = projOf.get(b.projectCode);
      const open = !!p && canSeeBookingDetail(viewer.role, viewer.assignments, facilityCode, { code: b.projectCode, entityCode: p.entityCode, confidential: p.confidential });
      hits.push({ kind: 'Booking', title: open ? `${b.ref} · ${dataText(b.title, lang)}` : b.ref, sub: open ? `${resourceCode} · ${b.projectCode}` : resourceCode, href: `/planning?week=${mondayOf(parisParts(b.startsAt).iso)}` });
    }
  }

  if (canSee(viewer.role, 'incidents') && /\d/.test(q)) {
    // An incident of a facility the viewer does not see stays hidden (its description is typed text).
    const ids = codes.length ? (await db.select({ id: resources.id }).from(resources).where(inArray(resources.facilityCode, codes))).map((r) => r.id) : [];
    const inc = await db.select().from(incidents)
      .where(and(ilike(incidents.ref, like), ids.length ? or(isNull(incidents.resourceId), inArray(incidents.resourceId, ids)) : isNull(incidents.resourceId))).limit(LIMIT);
    for (const i of inc) hits.push({ kind: 'Incident', title: i.ref, sub: dataText(i.label, lang), href: '/incidents' });
    const sc = await db.select({ ref: scenarios.ref }).from(scenarios).where(ilike(scenarios.ref, like)).limit(LIMIT);
    for (const s of sc) hits.push({ kind: 'Scenario', title: s.ref, sub: '', href: '/incidents' });
  }
  if (canSee(viewer.role, 'conflicts') && /\d/.test(q)) {
    const cf = await db.select({ ref: conflicts.ref, subject: conflicts.subject }).from(conflicts).where(ilike(conflicts.ref, like)).limit(LIMIT);
    for (const c of cf) hits.push({ kind: 'Conflict', title: c.ref, sub: c.subject, href: '/conflicts' });
  }
  return hits.slice(0, LIMIT);
}
