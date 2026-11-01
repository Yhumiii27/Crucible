// Vocabulary of delivery 5 (docs/spec/03 §7, decisions A-8, F-8): incidents, scenarios, notifications. Pure, no import.

/** A breakdown takes a resource out; an absence takes a person out; an urgency asks an urgent test (A-8). */
export const INCIDENT_KINDS = ['breakdown', 'absence', 'urgency'] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];
export const INCIDENT_KIND_LABEL: Record<IncidentKind, string> = { breakdown: 'Breakdown', absence: 'Absence', urgency: 'Urgency' };

export const INCIDENT_STATUSES = ['open', 'closed'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = { open: 'Open', closed: 'Closed' };

/** A recovery scenario (after an incident), an urgency scenario, or a what-if simulation that is never applied. */
export const SCENARIO_KINDS = ['recovery', 'urgency', 'what_if'] as const;
export type ScenarioKind = (typeof SCENARIO_KINDS)[number];
export const SCENARIO_KIND_LABEL: Record<ScenarioKind, string> = { recovery: 'Recovery scenario', urgency: 'Urgency scenario', what_if: 'What-if simulation' };

/** submitted → accepted (the bookings are moved) or rejected; a simulation stays a simulation. */
export const SCENARIO_STATUSES = ['submitted', 'accepted', 'rejected', 'simulation'] as const;
export type ScenarioStatus = (typeof SCENARIO_STATUSES)[number];
export const SCENARIO_STATUS_LABEL: Record<ScenarioStatus, string> = { submitted: 'Awaiting decision', accepted: 'Accepted', rejected: 'Rejected', simulation: 'Simulation' };

/** Kinds of notifications (F-8), EN source labels. */
export const NOTIFICATION_KINDS = {
  booking_confirmed: 'Booking confirmed',
  booking_cancelled: 'Booking cancelled',
  booking_moved: 'Your test was moved',
  incident: 'Incident on your test',
  scenario: 'Scenario to decide',
  conflict: 'Conflict to arbitrate',
  conflict_overdue: 'Arbitration overdue',
  recap: 'Your tests of the next two weeks',
  maintenance_due: 'Maintenance or calibration due',
} as const;
export type NotificationKind = keyof typeof NOTIFICATION_KINDS;
