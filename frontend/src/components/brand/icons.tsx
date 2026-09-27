import type { ReactNode } from "react";

/**
 * The design's own 2px-stroke UI icons (24×24 grid), for the ones with no close Phosphor
 * equivalent. Colour follows `currentColor`.
 */
function StrokeIcon({
  size = 24,
  strokeWidth = 2,
  children,
  className,
}: {
  size?: number;
  strokeWidth?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

type IconProps = { size?: number; strokeWidth?: number; className?: string };

/** "Our Vision" — sun on the horizon. */
export const IconSunrise = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M3 18h18" />
    <path d="M7 18a5 5 0 0 1 10 0" />
    <path d="M12 5v3" />
    <path d="M5.6 9.6l1.8 1.8" />
    <path d="M18.4 9.6l-1.8 1.8" />
  </StrokeIcon>
);

/** "Our Mission" — trowel. */
export const IconTrowel = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M14.5 9.5l5-5" />
    <path d="M18 3l3 3" />
    <path d="M13 8l3 3-6.5 6.5C7 20 4 20 4 20s0-3 2.5-5.5z" />
  </StrokeIcon>
);

export const IconArrowRight = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </StrokeIcon>
);

export const IconLeaf = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M5 19C5 10 10 5 20 4c0 10-5 15-13 15" />
    <path d="M5 19c3-5 7-8 11-10" />
  </StrokeIcon>
);

/** Compost bag. */
export const IconBag = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M6 8h12l2 12H4z" />
    <path d="M9 8a3 3 0 0 1 6 0" />
  </StrokeIcon>
);

/** pH / water drop. */
export const IconDrop = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
    <path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" />
  </StrokeIcon>
);

/** Waste bin. */
export const IconBin = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M10 11v5" />
    <path d="M14 11v5" />
  </StrokeIcon>
);

export const IconHeart = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
  </StrokeIcon>
);
