/**
 * Weights are Float kg (CLAUDE.md §19). Floats accumulate noise (0.1 + 0.2 ≠ 0.3), so
 * every derived figure is rounded to the gram and comparisons use a small tolerance.
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
