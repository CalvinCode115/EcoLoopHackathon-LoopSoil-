import { leafPath, ringArcPath } from "./loop-geometry";

/**
 * Static LoopSoil mark: an open ring closed by a leaf. Used in nav, footer, favicons.
 * Solid forest-700, no gradient — a gradient fading toward white reads poorly at this
 * small a size. The gradient version lives in <LoopHeroAnimation>, where it has room.
 */
export function LoopMark({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <path
        d={ringArcPath()}
        fill="none"
        stroke="var(--color-forest-700)"
        strokeWidth={9}
        strokeLinecap="round"
      />
      <path d={leafPath()} fill="var(--color-forest-500)" />
    </svg>
  );
}
