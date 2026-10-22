// Organisation vocabulary (docs/spec/00 §3, 02 §1–3): entity kinds and project priority classes. Pure, no import.

/** `internal`: the entity running Crucible (EPC2i); `partner`: an entity sharing some facilities (EPC France, A-3). */
export const ENTITY_KINDS = ['internal', 'partner'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ENTITY_KIND_LABEL: Record<EntityKind, string> = { internal: 'Internal', partner: 'Partner' };

/** Priority classes of the projects, set by the R&D director and reviewed each quarter (A-5). */
export const PRIORITY_CLASSES = ['P1', 'P2', 'P3'] as const;
export type PriorityClass = (typeof PRIORITY_CLASSES)[number];

export const PRIORITY_CLASS_LABEL: Record<PriorityClass, string> = { P1: 'P1 · Strategic', P2: 'P2 · Standard', P3: 'P3 · Exploratory' };

export const isPriorityClass = (v: unknown): v is PriorityClass => typeof v === 'string' && (PRIORITY_CLASSES as readonly string[]).includes(v);
