// Vocabulary of delivery 4 (docs/spec/02 §1, §4–5, 03 §5): statuses of substitutions, proposals and conflicts, the criteria
// of the priority rules and their labels. Pure, no import.

/** R-4: proposed, then validated by the host facility (and the safety officer when hazardous); retired with a reason. */
export const SUBSTITUTION_STATUSES = ['proposed', 'validated', 'retired'] as const;
export type SubstitutionStatus = (typeof SUBSTITUTION_STATUSES)[number];
export const SUBSTITUTION_STATUS_LABEL: Record<SubstitutionStatus, string> = { proposed: 'Awaiting validation', validated: 'Validated', retired: 'Retired' };

/** A proposal of the engine: accepted (a confirmed booking), rejected, or superseded by a later run. */
export const PROPOSAL_STATUSES = ['proposed', 'accepted', 'rejected', 'superseded'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = { proposed: 'Proposed', accepted: 'Accepted', rejected: 'Rejected', superseded: 'Superseded' };

/** A conflict is open until decided; a safety veto stops it; a later run that no longer finds it makes it obsolete. */
export const CONFLICT_STATUSES = ['open', 'decided', 'vetoed', 'obsolete'] as const;
export type ConflictStatus = (typeof CONFLICT_STATUSES)[number];
export const CONFLICT_STATUS_LABEL: Record<ConflictStatus, string> = { open: 'To arbitrate', decided: 'Decided', vetoed: 'Vetoed by safety', obsolete: 'No longer found' };

/**
 * Criteria of the priority rules (A-2), in their starting order. The R&D director may publish another order (A-1); each
 * proposal and each conflict cites the version that produced it.
 */
export const PRIORITY_CRITERIA = ['safety_regulatory', 'contractual', 'critical_milestone', 'priority_class', 'slack', 'seniority'] as const;
export type PriorityCriterion = (typeof PRIORITY_CRITERIA)[number];
export const PRIORITY_CRITERION_LABEL: Record<PriorityCriterion, string> = {
  safety_regulatory: 'Safety and regulatory test',
  contractual: 'Dated contractual commitment',
  critical_milestone: 'Critical milestone (no margin left)',
  priority_class: 'Priority class of the project',
  slack: 'Smallest margin first',
  seniority: 'Oldest request first',
};

/** Why the engine could not place a need (EN source strings). */
export const UNPLACED_REASON_LABEL = {
  no_resource: 'No resource in service for this test',
  no_slot: 'No free slot in the horizon',
  inspection_due: 'A regulatory inspection falls due: renew it first',
  no_staff: 'No qualified person available',
  no_equipment: 'The mobile equipment is not available',
} as const;
export type UnplacedReason = keyof typeof UNPLACED_REASON_LABEL;
