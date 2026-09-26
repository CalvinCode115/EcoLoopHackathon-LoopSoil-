"use client";

import { ArrowsClockwise } from "@phosphor-icons/react/dist/ssr/ArrowsClockwise";
import { BowlFood } from "@phosphor-icons/react/dist/ssr/BowlFood";
import { Drop } from "@phosphor-icons/react/dist/ssr/Drop";
import { Flower } from "@phosphor-icons/react/dist/ssr/Flower";
import { Leaf } from "@phosphor-icons/react/dist/ssr/Leaf";
import { Plant } from "@phosphor-icons/react/dist/ssr/Plant";
import { Recycle } from "@phosphor-icons/react/dist/ssr/Recycle";
import { SunHorizon } from "@phosphor-icons/react/dist/ssr/SunHorizon";
import type { Icon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";

interface Glyph {
  Icon: Icon;
  /** Percent position, top-left of the glyph's own box. */
  top: number;
  left: number;
  size: number;
  /** Full rotations take this many seconds. Negative = counter-clockwise. */
  seconds: number;
  opacity: number;
}

// Scattered asymmetrically on purpose (not a grid): a wallpaper of eco, food and
// loop symbols, tuned faint enough to sit behind body text without hurting legibility.
const GLYPHS: Glyph[] = [
  { Icon: Leaf, top: 8, left: 6, size: 88, seconds: 70, opacity: 0.07 },
  {
    Icon: ArrowsClockwise,
    top: 14,
    left: 82,
    size: 56,
    seconds: -52,
    opacity: 0.08,
  },
  { Icon: Flower, top: 30, left: 92, size: 64, seconds: 64, opacity: 0.06 },
  { Icon: Plant, top: 46, left: 3, size: 72, seconds: -60, opacity: 0.07 },
  { Icon: Drop, top: 62, left: 88, size: 40, seconds: 46, opacity: 0.08 },
  {
    Icon: SunHorizon,
    top: 78,
    left: 10,
    size: 60,
    seconds: -74,
    opacity: 0.06,
  },
  { Icon: BowlFood, top: 86, left: 70, size: 52, seconds: 58, opacity: 0.07 },
  { Icon: Recycle, top: 4, left: 40, size: 44, seconds: -48, opacity: 0.06 },
];

/**
 * Ambient background texture shared by the landing, login and register pages: leaf,
 * food and loop symbols, slowly rotating. Fixed and pointer-events-none so it never
 * competes with content or scrolls independently; opacity kept low enough (≤8%) to
 * never threaten text contrast on top of it. Freezes under reduced motion.
 */
export function EcoBackdrop() {
  const reduce = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas"
    >
      {GLYPHS.map(({ Icon, top, left, size, seconds, opacity }, i) => (
        <motion.div
          key={i}
          className="absolute text-forest-700"
          style={{ top: `${top}%`, left: `${left}%`, opacity }}
          initial={false}
          animate={reduce ? undefined : { rotate: seconds > 0 ? 360 : -360 }}
          transition={
            reduce
              ? undefined
              : {
                  duration: Math.abs(seconds),
                  repeat: Infinity,
                  ease: "linear",
                }
          }
        >
          <Icon size={size} weight="thin" />
        </motion.div>
      ))}
    </div>
  );
}
