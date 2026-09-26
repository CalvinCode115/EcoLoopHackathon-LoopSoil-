/**
 * Backend config, not DB-stored (Backend-Updates.md Part D). Each is used by the module
 * whose stage introduced it; kept together here since the doc groups them as one set.
 */

/** Per individual, per batch — running total of PENDING+APPROVED+COLLECTED claims. */
export const MAX_CLAIM_KG = 1;
/** Per individual, per batch — claims must be in steps of this size. */
export const MIN_CLAIM_KG = 0.1;

/** How close to a slot's start a booking may still be moved ("Change Pickup"). */
export const CHANGE_SLOT_CUTOFF_HOURS = 2;

/** A handover's actualKg may exceed approvedKg/allocatedKg by at most this fraction. */
export const HANDOVER_OVER_TOLERANCE = 0.1;
