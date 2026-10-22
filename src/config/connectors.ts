// Connectors of Crucible (docs/spec/00 §5, DEMANDES-*.md; delivery 3): the pub_ views of the other tools Crucible reads, and the
// pub_ views it publishes. Crucible reads another tool only through its pub_ views, granted by Matrix (partage/90-droits.sql);
// until a view exists and is granted, Crucible works from what is entered in it. Pure: no import.

export interface ConnectorDef {
  /** Schema-qualified view: "keystone.pub_jalons". */
  view: string;
  /** Owning tool. */
  tool: 'Keystone' | 'Cursus' | 'Codex' | 'Vigie' | 'Matrix' | 'Crucible';
  /** What Crucible does with it (EN source string). */
  use: string;
  /** Request or decision that asks for it. */
  request: string;
  /** Crucible delivery that reads (or publishes) it. */
  delivery: string;
}

/** Views Crucible reads. */
export const READ_CONNECTORS: readonly ConnectorDef[] = [
  { view: 'keystone.pub_projets', tool: 'Keystone', use: 'Keystone project linked to an R&D project', request: 'S-1', delivery: 'L3' },
  { view: 'keystone.pub_jalons', tool: 'Keystone', use: 'Milestones read instead of entered', request: 'K-2 · S-2', delivery: 'L3' },
  { view: 'cursus.pub_salaries', tool: 'Cursus', use: 'People who run the tests', request: 'S-3', delivery: 'L4' },
  { view: 'cursus.pub_titres_detenus', tool: 'Cursus', use: 'Skills and authorisations of the operators', request: 'S-3', delivery: 'L4' },
  { view: 'cursus.pub_absences', tool: 'Cursus', use: 'Absences of the operators', request: 'CU-1', delivery: 'L4' },
  { view: 'codex.pub_documents', tool: 'Codex', use: 'Protocols and test reports referenced', request: 'S-6', delivery: 'L3' },
  { view: 'vigie.pub_controles', tool: 'Vigie', use: 'Regulatory inspections of the resources', request: 'V-1 · S-4', delivery: 'L5' },
  { view: 'vigie.pub_suspensions_essais', tool: 'Vigie', use: 'Tests suspended during an outside intervention', request: 'R-7', delivery: 'L5' },
  { view: 'matrix.pub_sites', tool: 'Matrix', use: 'Sites of the facilities', request: 'M-6', delivery: 'L1' },
  { view: 'matrix.pub_filiales', tool: 'Matrix', use: 'Entities sharing the facilities', request: 'M-6', delivery: 'L1' },
];

/** Views Crucible publishes, and who reads them. */
export const PUBLISHED_VIEWS: readonly (ConnectorDef & { readers: string })[] = [
  { view: 'crucible.pub_moyens', tool: 'Crucible', use: 'Test resources, facility, site, state', request: 'S-5', delivery: 'L3', readers: 'Keystone, Vigie, Matrix' },
  { view: 'crucible.pub_reservations', tool: 'Crucible', use: 'Bookings that hold a resource; confidential projects masked', request: 'S-5 · R-7 · S-7', delivery: 'L3', readers: 'Keystone, Vigie, Matrix' },
  { view: 'crucible.pub_journal', tool: 'Crucible', use: 'Audit trail for the unified journal', request: 'X-4', delivery: 'L1', readers: 'Matrix' },
];
