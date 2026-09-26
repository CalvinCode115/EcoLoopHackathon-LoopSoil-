import { Prisma } from '../generated/prisma/client';

/**
 * Weights are kg (CLAUDE.md §19). Every derived figure is rounded to the gram.
 *
 * Kg fields are `Decimal` in the schema (Backend-Updates.md §C5) specifically so
 * summing many small amounts (many claims against one batch) never drifts the way
 * repeated JS `number` addition does. `roundKg` / `kgExceeds` below are the LEGACY
 * plain-number helpers — still used by modules not yet migrated to Decimal math.
 * `roundDecimal` / `decimalExceeds` / `decimalToNumber` are the Decimal-native
 * equivalents; use those for any new kg arithmetic.
 */
export const KG_PRECISION = 3; // grams
const KG_EPSILON = 0.0005;

export function roundKg(value: number): number {
  const f = 10 ** KG_PRECISION;
  return Math.round(value * f) / f;
}

/** `a > b` beyond float noise. */
export function kgExceeds(a: number, b: number): boolean {
  return a - b > KG_EPSILON;
}

export function formatKg(value: number): string {
  return `${roundKg(value)} kg`;
}

// ─── Decimal-native equivalents (Backend-Updates.md §C5) ──────────────────────

/**
 * Anything `new Prisma.Decimal(...)` accepts. decimal.js itself types this as its own
 * `Decimal.Value` nested type, but the generated client re-exports `Decimal` as a plain
 * class/type alias, not as a namespace — so `Prisma.Decimal.Value` doesn't resolve.
 * This is the same shape, declared locally instead of depending on that internal detail.
 */
export type DecimalValue = string | number | Prisma.Decimal;

export function toDecimal(value: DecimalValue): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function roundDecimal(value: DecimalValue): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(KG_PRECISION);
}

/** `a > b`. Decimal comparisons are exact, so no epsilon tolerance is needed here. */
export function decimalExceeds(a: DecimalValue, b: DecimalValue): boolean {
  return toDecimal(a).greaterThan(toDecimal(b));
}

/** Convert to a plain number at the API boundary, rounded to the gram. */
export function decimalToNumber(value: DecimalValue): number {
  return roundDecimal(value).toNumber();
}

export function formatDecimalKg(value: DecimalValue): string {
  return `${decimalToNumber(value)} kg`;
}
