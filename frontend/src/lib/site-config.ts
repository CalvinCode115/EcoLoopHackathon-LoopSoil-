/**
 * Facts the design leaves as placeholders. Fill these in once SUSS confirms them; every
 * screen that shows them reads from here.
 */

/** Shown wherever the design says "[contact email]". null = not supplied yet. */
export const SUSS_CONTACT_EMAIL: string | null = null;

/** Display text for the contact email, falling back to the design's placeholder. */
export const CONTACT_EMAIL_TEXT = SUSS_CONTACT_EMAIL ?? "[contact email]";

/** "View on map" link for the SUSS bin centre. null = link hidden until supplied. */
export const BIN_CENTRE_MAP_URL: string | null = null;

/**
 * Dashboard "kg diverted over time" target line (kg per week). The design shows 6kg/week
 * as an example — set the real pilot goal once SUSS confirms it.
 */
export const WEEKLY_TARGET_KG = 6;
