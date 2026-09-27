/**
 * Flat line + fill illustrations from the design system ("green & soil brown, edges only,
 * never behind text"). Every one is built from the same leaf shape, placed with
 * translate/rotate/scale exactly as in the design. All are decorative (aria-hidden).
 */

const LEAF = "#4F7A3A";
const LEAF_LIGHT = "#6E9A52";
const DEEP = "#2F4A24";
const SOIL = "#7A5A3C";
const SOIL_DARK = "#5F4530";
const SOIL_LIGHT = "#A88763";

/** The shared leaf. Stroke widths are divided by the scale so lines stay ~2px on screen. */
function Leaf({
  x,
  y,
  rotate,
  scale,
  flip = false,
  fill,
}: {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  flip?: boolean;
  fill: string;
}) {
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${rotate}) scale(${flip ? -scale : scale} ${scale})`}
    >
      <path
        d="M0 0 C 14 -26 50 -34 78 -18 C 56 4 22 10 0 0 Z"
        fill={fill}
        stroke={DEEP}
        strokeWidth={(2 / scale).toFixed(2)}
        strokeLinejoin="round"
      />
      <path
        d="M6 -3 C 28 -12 50 -17 72 -18"
        fill="none"
        stroke={DEEP}
        strokeWidth={(1.4 / scale).toFixed(2)}
        strokeLinecap="round"
      />
    </g>
  );
}

const SPRIG_LEAVES = [
  { x: 30, y: 70, rotate: -80, scale: 0.34 },
  { x: 34, y: 66, rotate: 10, scale: 0.34 },
  { x: 56, y: 48, rotate: -90, scale: 0.3 },
  { x: 60, y: 44, rotate: 0, scale: 0.3 },
  { x: 80, y: 30, rotate: -100, scale: 0.26 },
  { x: 84, y: 26, rotate: -10, scale: 0.26 },
  { x: 98, y: 14, rotate: -40, scale: 0.24 },
];
const SPRIG_MIXED = [
  LEAF,
  LEAF_LIGHT,
  LEAF_LIGHT,
  LEAF,
  LEAF,
  LEAF_LIGHT,
  LEAF,
];

/** A stem with seven leaves. `rotate` turns the whole sprig; `light` = all pale leaves. */
export function LeafSprig({
  rotate = 30,
  light = false,
  width = 120,
  className,
}: {
  rotate?: number;
  light?: boolean;
  width?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 96"
      width={width}
      height={(width * 96) / 120}
      aria-hidden
      className={className}
    >
      <g transform={`rotate(${rotate} 60 48)`}>
        <path
          d="M10 88 C 30 70 50 50 100 12"
          fill="none"
          stroke={DEEP}
          strokeWidth="3"
          strokeLinecap="round"
        />
        {SPRIG_LEAVES.map((l, i) => (
          <Leaf key={i} {...l} fill={light ? LEAF_LIGHT : SPRIG_MIXED[i]} />
        ))}
      </g>
    </svg>
  );
}

/** A sprout on a mound of soil. */
export function Sprout({
  width = 96,
  className,
}: {
  width?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 100"
      width={width}
      height={(width * 100) / 120}
      aria-hidden
      className={className}
    >
      <path
        d="M8 94 C 28 70 92 70 112 94 Z"
        fill={SOIL}
        stroke={SOIL_DARK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="40" cy="86" r="2.5" fill={SOIL_LIGHT} />
      <circle cx="78" cy="84" r="2.5" fill={SOIL_DARK} />
      <path
        d="M60 78 C 60 62 57 50 60 36"
        fill="none"
        stroke={DEEP}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <Leaf x={59} y={50} rotate={18} scale={0.5} flip fill={LEAF_LIGHT} />
      <Leaf x={60} y={38} rotate={-34} scale={0.56} fill={LEAF} />
    </svg>
  );
}

/** A bowl of scraps: bread, a leaf, a tomato. */
export function FoodWaste({ size = 72 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <path
        d="M22 30 C 20 22 26 16 32 18 C 34 12 44 12 44 20 C 50 18 54 26 48 30 Z"
        fill="#E3BE5C"
        stroke={SOIL_DARK}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <Leaf x={20} y={30} rotate={-60} scale={0.22} fill={LEAF} />
      <circle
        cx="46"
        cy="24"
        r="6"
        fill="#C0603F"
        stroke={SOIL_DARK}
        strokeWidth="2.2"
      />
      <path
        d="M8 32 L56 32 C 56 46 46 56 32 56 C 18 56 8 46 8 32 Z"
        fill="#FBF8F1"
        stroke={SOIL_DARK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M16 40 C 20 46 26 48 32 48"
        fill="none"
        stroke={SOIL_LIGHT}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A warm, steaming compost heap. */
export function CompostHeap({ size = 72 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <path
        d="M22 20 c -3 -4 3 -6 0 -10 M32 18 c -3 -4 3 -6 0 -10 M42 20 c -3 -4 3 -6 0 -10"
        fill="none"
        stroke={SOIL}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M4 54 C 10 32 24 26 32 26 C 40 26 54 32 60 54 Z"
        fill={SOIL}
        stroke={SOIL_DARK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="22" cy="44" r="2.5" fill={SOIL_LIGHT} />
      <circle cx="36" cy="38" r="2.5" fill={SOIL_DARK} />
      <circle cx="44" cy="48" r="2.5" fill={SOIL_LIGHT} />
      <circle cx="28" cy="50" r="2" fill={SOIL_DARK} />
    </svg>
  );
}

/** A planter box with three plants. */
export function GardenBed({ size = 72 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <path
        d="M20 38 C 20 30 18 24 20 18"
        fill="none"
        stroke={DEEP}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <Leaf x={20} y={28} rotate={20} scale={0.2} flip fill={LEAF_LIGHT} />
      <Leaf x={20} y={20} rotate={-30} scale={0.22} fill={LEAF} />
      <path
        d="M44 38 C 44 28 42 20 44 12"
        fill="none"
        stroke={DEEP}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <Leaf x={44} y={30} rotate={24} scale={0.22} flip fill={LEAF} />
      <Leaf x={44} y={22} rotate={-34} scale={0.24} fill={LEAF_LIGHT} />
      <Leaf x={44} y={14} rotate={-70} scale={0.16} fill={LEAF} />
      <path
        d="M32 38 C 32 34 31 30 32 26"
        fill="none"
        stroke={DEEP}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <Leaf x={32} y={30} rotate={-40} scale={0.16} fill={LEAF} />
      <rect
        x="6"
        y="38"
        width="52"
        height="18"
        rx="4"
        fill="#B5784C"
        stroke={SOIL_DARK}
        strokeWidth="2.5"
      />
      <path d="M6 46 L58 46" stroke={SOIL_DARK} strokeWidth="2" />
    </svg>
  );
}

/**
 * An empty flower pot with a single small sprout (404 and "nothing here" states).
 * Informative, not decorative, so it carries an accessible label.
 */
export function EmptyPot({
  width = 240,
  className,
}: {
  width?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 240 220"
      width={width}
      height={(width * 220) / 240}
      role="img"
      aria-label="Illustration: an empty flower pot with a single small sprout"
      className={className}
    >
      <ellipse cx="120" cy="214" rx="96" ry="8" fill="#E6DCC7" />
      <Leaf x={36} y={70} rotate={-30} scale={0.3} fill="#9DB887" />
      <Leaf x={204} y={96} rotate={40} scale={0.26} flip fill="#9DB887" />
      <path
        d="M72 134 L168 134 L155 202 C 154 208 149 212 143 212 L97 212 C 91 212 86 208 85 202 Z"
        fill="#A86A40"
        stroke={SOIL_DARK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <rect
        x="60"
        y="110"
        width="120"
        height="28"
        rx="8"
        fill="#B5784C"
        stroke={SOIL_DARK}
        strokeWidth="3"
      />
      <ellipse cx="120" cy="114" rx="50" ry="6" fill={SOIL_DARK} />
      <path
        d="M80 156 l5 34"
        stroke="#C48A5C"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M120 112 C 120 98 118 90 121 80"
        fill="none"
        stroke={DEEP}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <Leaf x={120} y={92} rotate={22} scale={0.32} flip fill={LEAF_LIGHT} />
      <Leaf x={121} y={82} rotate={-36} scale={0.36} fill={LEAF} />
    </svg>
  );
}
