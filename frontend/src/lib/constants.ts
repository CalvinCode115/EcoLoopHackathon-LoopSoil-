/**
 * Business rules mirrored from backend/src/common/constants.ts, for display and form
 * validation only. The backend enforces them; keep the two in sync.
 */

/** Per individual, per batch — running total of pending + approved + collected claims. */
export const MAX_CLAIM_KG = 1;
/** Claims come in steps of this size, starting at it. */
export const MIN_CLAIM_KG = 0.1;
/** How close to a slot's start a booking may still be moved ("Change pickup"). */
export const CHANGE_SLOT_CUTOFF_HOURS = 2;
