/**
 * "Enum values never reach the screen" (Taker components → Friendly labels). Keys are the
 * REAL backend enums/codes (Backend-skeleton.md); values are the design's wording. Where
 * the design had no wording yet, the text is marked `// [draft copy]` — confirm with the team.
 */

export type ClaimStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "COLLECTED"
  /** Booking-level in the backend; shown as a claim status in the design. */
  | "NO_SHOW";

export type BatchStatus = "DRAFT" | "OPEN" | "CLOSED" | "COMPLETED";

export type TakerStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  COLLECTED: "Collected",
  NO_SHOW: "No-show",
};

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  CLOSED: "Closed",
  COMPLETED: "Completed",
};

/** Manager-facing one-liners under each batch status (Manager components). */
export const BATCH_STATUS_HINT: Record<BatchStatus, string> = {
  DRAFT: "Logged, not yet visible to takers",
  OPEN: "Takers can claim",
  CLOSED: "Claiming ended, pickups ongoing",
  COMPLETED: "All stock handed over",
};

export const TAKER_CATEGORY_LABEL = {
  NPARKS: "NParks",
  TOWN_COUNCIL: "Town council",
  SCHOOL: "School",
  COMMUNITY_GARDEN: "Community garden",
  INDEPENDENT_FARMER: "Independent farmer",
  OTHER: "Other",
} as const;

export const ALLOCATION_STATUS_LABEL = {
  PLANNED: "Planned",
  CONFIRMED: "Confirmed",
  COLLECTED: "Collected",
  CANCELLED: "Cancelled",
} as const;

/** Design names FOUND_ELSEWHERE / CANT_MAKE_PICKUP map to the backend's names here. */
export const CANCELLATION_REASON_LABEL = {
  WRONG_AMOUNT: "Wrong amount",
  SOURCED_ELSEWHERE: "Found compost elsewhere",
  CANNOT_MAKE_PICKUP: "Can’t make the pickup",
  NO_LONGER_NEEDED: "No longer needed",
  OTHER: "Other",
} as const;
export type CancellationReason = keyof typeof CANCELLATION_REASON_LABEL;

/** Shown to the taker on a rejected claim. */
export const REJECTION_REASON_LABEL = {
  INSUFFICIENT_SUPPLY: "Not enough compost left.",
  HIGHER_PRIORITY: "Other requests were prioritised this time.", // [draft copy]
  SLOT_UNAVAILABLE: "No pickup time could be arranged.", // [draft copy]
  INELIGIBLE_TAKER: "This request doesn’t meet the eligibility rules.", // [draft copy]
  OTHER: "The SUSS team left a note below.",
} as const;
export type RejectionReason = keyof typeof REJECTION_REASON_LABEL;

/** The manager's wording for the same reasons (Reject dialog select, claim detail). */
export const REJECTION_REASON_MANAGER_LABEL: Record<RejectionReason, string> = {
  INSUFFICIENT_SUPPLY: "Not enough compost left",
  HIGHER_PRIORITY: "Higher priority request",
  SLOT_UNAVAILABLE: "No suitable pickup time",
  INELIGIBLE_TAKER: "Not eligible",
  OTHER: "Other",
};

export const NO_SHOW_EXPLANATION =
  "The collection deadline passed, so the compost went back to the pool.";

/**
 * Friendly text for API error codes the taker can hit. Anything not listed falls back to
 * the backend's own `message`, which is already human-readable.
 */
export const ERROR_CODE_LABEL: Partial<Record<string, string>> = {
  INSUFFICIENT_POOL: "Not enough compost left.",
  CLAIM_ALLOWANCE_EXCEEDED: "You’ve reached your 1kg limit for this batch.",
  CLAIM_BELOW_MINIMUM: "Minimum is 0.1kg.",
  TAKER_NOT_APPROVED: "Your account hasn’t been approved yet.",
};

/** Prefer the design's wording for known codes, else the server's message. */
export function friendlyError(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (err && typeof err === "object") {
    const e = err as { code?: string; message?: string };
    if (e.code && ERROR_CODE_LABEL[e.code]) return ERROR_CODE_LABEL[e.code]!;
    if (e.message) return e.message;
  }
  return fallback;
}
