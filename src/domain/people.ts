// Input checks of delivery 4 (docs/spec/02 §1, §4): people and their skills, absences, skills and equipment a test type asks,
// substitutions (R-4), mobile equipment (R-8), and the staff of an accepted proposal re-checked at the moment it becomes a
// booking. Pure; messages are EN source strings.
import { isIsoDate } from './clock';
import { overlaps, type Interval } from './calendar';
import type { Check } from './resources';

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const CODE = /^[A-Z0-9][A-Z0-9-]{1,23}$/;

export function checkSkill(raw: Record<string, unknown>, taken: ReadonlySet<string>): Check<{ code: string; name: string; cursusTitreId: string | null }> {
  const code = text(raw.code).toUpperCase();
  if (!CODE.test(code)) return { ok: false, error: 'The code has 2 to 24 letters, digits or dashes' };
  if (taken.has(code)) return { ok: false, error: 'This code is already used' };
  const name = text(raw.name);
  if (name.length < 2 || name.length > 120) return { ok: false, error: 'Name the skill' };
  return { ok: true, value: { code, name, cursusTitreId: text(raw.cursusTitreId).slice(0, 80) || null } };
}

export function checkPerson(raw: Record<string, unknown>, ctx: { entities: ReadonlySet<string>; facilities: ReadonlySet<string>; matricules: ReadonlySet<string> }): Check<{ name: string; entityCode: string; matricule: string | null; facilityCodes: string[] }> {
  const name = text(raw.name);
  if (name.length < 2 || name.length > 120) return { ok: false, error: 'Enter the person’s name' };
  const entityCode = text(raw.entityCode).toUpperCase();
  if (!ctx.entities.has(entityCode)) return { ok: false, error: 'Choose an entity' };
  const matricule = text(raw.matricule) || null;
  if (matricule && (matricule.length > 30 || ctx.matricules.has(matricule))) return { ok: false, error: 'This matricule is already used' };
  const codes = Array.isArray(raw.facilityCodes) ? raw.facilityCodes.map(text) : [];
  const facilityCodes = [...new Set(codes.filter(Boolean))].sort();
  if (!facilityCodes.length || facilityCodes.some((f) => !ctx.facilities.has(f))) return { ok: false, error: 'Choose the facilities where the person works' };
  return { ok: true, value: { name, entityCode, matricule, facilityCodes } };
}

export function checkPersonSkill(raw: Record<string, unknown>, skills: ReadonlySet<string>): Check<{ skillCode: string; validUntil: string | null }> {
  const skillCode = text(raw.skillCode).toUpperCase();
  if (!skills.has(skillCode)) return { ok: false, error: 'Choose a skill' };
  const validUntil = text(raw.validUntil) || null;
  if (validUntil && !isIsoDate(validUntil)) return { ok: false, error: 'Enter the last day of validity' };
  return { ok: true, value: { skillCode, validUntil } };
}

export function checkAbsence(raw: Record<string, unknown>): Check<{ fromOn: string; toOn: string }> {
  const fromOn = text(raw.fromOn);
  const toOn = text(raw.toOn) || fromOn;
  if (!isIsoDate(fromOn) || !isIsoDate(toOn) || toOn < fromOn) return { ok: false, error: 'Enter the first and last days' };
  return { ok: true, value: { fromOn, toOn } };
}

export interface SubstitutionInput {
  testTypeCode: string;
  resourceId: string;
  conditions: string;
  codexRef: string;
  technicalReferent: string;
  hazardous: boolean;
}

/** R-4: a test type on another resource than its nominal one, with its conditions, justification and technical referent. */
export function checkSubstitution(raw: Record<string, unknown>, ctx: { testTypes: ReadonlyMap<string, string | null>; resources: ReadonlySet<string>; taken: ReadonlySet<string> }): Check<SubstitutionInput> {
  const testTypeCode = text(raw.testTypeCode).toUpperCase();
  if (!ctx.testTypes.has(testTypeCode)) return { ok: false, error: 'Choose a test type of the catalogue' };
  const resourceId = text(raw.resourceId);
  if (!ctx.resources.has(resourceId)) return { ok: false, error: 'Choose one of the resources' };
  if (ctx.testTypes.get(testTypeCode) === resourceId) return { ok: false, error: 'This is the nominal resource of the test type' };
  if (ctx.taken.has(`${testTypeCode}|${resourceId}`)) return { ok: false, error: 'This substitution already exists' };
  const conditions = text(raw.conditions);
  if (conditions.length < 5 || conditions.length > 1000) return { ok: false, error: 'State the conditions of the substitution' };
  const codexRef = text(raw.codexRef);
  if (codexRef.length < 2 || codexRef.length > 60) return { ok: false, error: 'Enter the Codex reference of the technical justification' };
  const technicalReferent = text(raw.technicalReferent);
  if (technicalReferent.length < 2 || technicalReferent.length > 120) return { ok: false, error: 'Name the technical referent of the test type' };
  return { ok: true, value: { testTypeCode, resourceId, conditions, codexRef, technicalReferent, hazardous: raw.hazardous === 'on' || raw.hazardous === 'true' || raw.hazardous === true } };
}

export function checkEquipment(raw: Record<string, unknown>, ctx: { taken: ReadonlySet<string>; facilities: ReadonlySet<string> }): Check<{ code: string; name: string; facilityCode: string }> {
  const code = text(raw.code).toUpperCase();
  if (!CODE.test(code)) return { ok: false, error: 'The code has 2 to 24 letters, digits or dashes' };
  if (ctx.taken.has(code)) return { ok: false, error: 'This code is already used' };
  const name = text(raw.name);
  if (name.length < 2 || name.length > 120) return { ok: false, error: 'Name the equipment' };
  const facilityCode = text(raw.facilityCode).toUpperCase();
  if (!ctx.facilities.has(facilityCode)) return { ok: false, error: 'Choose one of your facilities' };
  return { ok: true, value: { code, name, facilityCode } };
}

/**
 * Issues of the people and equipment of a slot, checked again when a proposal becomes a booking: each person holds the
 * skill on the last day, is present, and is on no other booking at the same time; each equipment is on no other booking.
 */
export function staffAndEquipmentIssues(slot: Interval & { firstDay: string; lastDay: string }, staff: readonly { personId: string; skillCode: string }[], equipment: readonly string[], facts: {
  people: ReadonlyMap<string, { name: string; skills: readonly { code: string; validUntil: string | null }[]; absences: readonly { fromOn: string; toOn: string }[] }>;
  staffBusy: readonly (Interval & { personId: string })[];
  equipmentBusy: readonly (Interval & { code: string })[];
}): string[] {
  const out: string[] = [];
  for (const s of staff) {
    const p = facts.people.get(s.personId);
    if (!p) {
      out.push('A person of the proposal is no longer active');
      continue;
    }
    if (!p.skills.some((k) => k.code === s.skillCode && (k.validUntil == null || k.validUntil >= slot.lastDay))) out.push(`No longer holds the skill · ${p.name} · ${s.skillCode}`);
    if (p.absences.some((a) => a.fromOn <= slot.lastDay && a.toOn >= slot.firstDay)) out.push(`Absent · ${p.name}`);
    if (facts.staffBusy.some((b) => b.personId === s.personId && overlaps(b, slot))) out.push(`Already on another test · ${p.name}`);
  }
  for (const e of equipment) if (facts.equipmentBusy.some((b) => b.code === e && overlaps(b, slot))) out.push(`Equipment already booked · ${e}`);
  return out;
}
