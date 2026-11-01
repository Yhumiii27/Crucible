// Tabs of a facility sheet (delivery 5b): listed in the sidebar's Facility section, under the facility switcher, and as the
// sheet's tab bar (`/facilities/[code]?tab=`). Pure: loaded by the nav model and the page.
export const FACILITY_TABS = ['resources', 'calendar', 'inspections', 'maintenance', 'equipment', 'measurement'] as const;
export type FacilityTab = (typeof FACILITY_TABS)[number];

/** EN source strings. */
export const FACILITY_TAB_LABEL: Record<FacilityTab, string> = {
  resources: 'Resources & zones',
  calendar: 'Calendar & unavailabilities',
  inspections: 'Periodic inspections',
  /** CR-073: preventive maintenance and calibration plans, their interventions. */
  maintenance: 'Maintenance & calibration',
  equipment: 'Mobile equipment',
  /** CR-071: kiosks and sensors, their events, uses without a booking. */
  measurement: 'Occupancy measurement',
};

export const isFacilityTab = (v: unknown): v is FacilityTab => typeof v === 'string' && (FACILITY_TABS as readonly string[]).includes(v);

/** URL of a tab of a facility sheet (the first tab has no parameter). */
export function facilityTabHref(code: string, tab: FacilityTab): string {
  const base = `/facilities/${encodeURIComponent(code)}`;
  return tab === 'resources' ? base : `${base}?tab=${tab}`;
}
