/**
 * Shared geometry for the LoopSoil mark: an open ring (the loop, not yet closed)
 * with a leaf sitting in the gap (new growth closing it). Used by both the static
 * <LoopMark> and the animated hero centerpiece so they draw the exact same shape.
 *
 * viewBox is always 0 0 100 100; cx/cy = 50/50.
 */
export const CX = 50;
export const CY = 50;
export const RADIUS = 38;

/**
 * Gap sits at roughly "10:30" (upper left), 60° wide. Angle 0 = 12 o'clock,
 * increasing clockwise (see toRad below) — negative angles go counter-clockwise from noon.
 */
const GAP_CENTER_DEG = -45;
const GAP_HALF_WIDTH_DEG = 30;

/** The ring is drawn from just past the gap, clockwise, all the way back to it. */
export const ARC_START_DEG = GAP_CENTER_DEG + GAP_HALF_WIDTH_DEG; // -15
export const ARC_END_DEG = ARC_START_DEG + 300; // 285 (= -75 + 360)

function toRad(deg: number): number {
  return ((deg - 90) * Math.PI) / 180;
}

export function pointOnRing(
  angleDeg: number,
  radius: number = RADIUS,
): { x: number; y: number } {
  const rad = toRad(angleDeg);
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

/** SVG path `d` for the open ring arc (large-arc, clockwise). */
export function ringArcPath(): string {
  const start = pointOnRing(ARC_START_DEG);
  const end = pointOnRing(ARC_END_DEG);
  const sweep = ARC_END_DEG - ARC_START_DEG;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/** `n` sample points evenly spaced along the ring, for orbiting nodes. */
export function ringSamples(n: number): { x: number; y: number }[] {
  const sweep = ARC_END_DEG - ARC_START_DEG;
  return Array.from({ length: n }, (_, i) =>
    pointOnRing(ARC_START_DEG + (sweep * i) / (n - 1)),
  );
}

/**
 * A small leaf (vesica shape) sitting in the gap, pointing outward along the radius.
 * Tip and base sit on the same ray from the ring's center, so the leaf is already
 * radially oriented; the bulge is offset perpendicular to that ray, not along X,
 * so it stays symmetric regardless of which angle the gap sits at.
 */
export function leafPath(): string {
  const tip = pointOnRing(GAP_CENTER_DEG, RADIUS + 5);
  const base = pointOnRing(GAP_CENTER_DEG, RADIUS - 7);
  const dx = tip.x - base.x;
  const dy = tip.y - base.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy; // perpendicular unit vector
  const py = ux;
  const midX = (tip.x + base.x) / 2;
  const midY = (tip.y + base.y) / 2;
  const width = 3.2;
  const c1x = midX + px * width;
  const c1y = midY + py * width;
  const c2x = midX - px * width;
  const c2y = midY - py * width;
  return `M ${base.x} ${base.y} Q ${c1x} ${c1y} ${tip.x} ${tip.y} Q ${c2x} ${c2y} ${base.x} ${base.y} Z`;
}
