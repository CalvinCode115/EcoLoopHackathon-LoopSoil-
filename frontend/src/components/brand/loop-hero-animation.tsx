"use client";

import { motion, useReducedMotion } from "motion/react";
import { leafPath, ringArcPath, ringSamples } from "./loop-geometry";

const NODE_LABELS = ["Harvest", "Claim", "Collect"] as const;
const NODE_COUNT = NODE_LABELS.length;
const SAMPLE_COUNT = 48;
const ORBIT_SECONDS = 16;

/**
 * The landing hero's centerpiece: the ring draws itself once (the loop being described),
 * then three nodes travel around it endlessly (harvest → claim → collect, on repeat).
 * Motivated by content, not decoration: this is the product's actual cycle, illustrated.
 * Freezes to a static, fully-drawn ring with nodes at rest under reduced motion.
 */
export function LoopHeroAnimation({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  const samples = ringSamples(SAMPLE_COUNT);
  const nodeStartIndices = Array.from({ length: NODE_COUNT }, (_, i) =>
    Math.floor((i * SAMPLE_COUNT) / NODE_COUNT),
  );

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="A loop connecting harvest, claim and collect, illustrating how compost moves from campus to community"
    >
      <defs>
        {/* Dark green fading toward white: the ring dissolves at one end rather than
            closing on a second hue. Deliberate, not a rendering gap. */}
        <linearGradient
          id="loophero-gradient"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="var(--color-forest-900)" />
          <stop offset="65%" stopColor="var(--color-forest-500)" />
          <stop offset="100%" stopColor="var(--color-canvas-raised)" />
        </linearGradient>
      </defs>

      <motion.path
        d={ringArcPath()}
        fill="none"
        stroke="url(#loophero-gradient)"
        strokeWidth={2.2}
        strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
      />

      <motion.path
        d={leafPath()}
        fill="var(--color-forest-500)"
        initial={reduce ? false : { opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: 0.5,
          delay: reduce ? 0 : 1.4,
          ease: [0.16, 1, 0.3, 1],
        }}
        style={{ transformOrigin: "center", transformBox: "fill-box" }}
      />

      {nodeStartIndices.map((startIndex, i) => {
        const ordered = [
          ...samples.slice(startIndex),
          ...samples.slice(0, startIndex + 1),
        ];
        const start = samples[startIndex];
        return (
          <motion.circle
            key={NODE_LABELS[i]}
            r={2.4}
            fill="var(--color-canvas)"
            stroke={
              i % 2 === 0
                ? "var(--color-forest-700)"
                : "var(--color-forest-500)"
            }
            strokeWidth={1.6}
            initial={{
              cx: start.x,
              cy: start.y,
              opacity: 0,
            }}
            animate={
              reduce
                ? { opacity: 1 }
                : {
                    cx: ordered.map((p) => p.x),
                    cy: ordered.map((p) => p.y),
                    opacity: 1,
                  }
            }
            transition={
              reduce
                ? { delay: 1.8, duration: 0.4 }
                : {
                    opacity: { delay: 1.8, duration: 0.4 },
                    cx: {
                      delay: 1.8,
                      duration: ORBIT_SECONDS,
                      repeat: Infinity,
                      ease: "linear",
                    },
                    cy: {
                      delay: 1.8,
                      duration: ORBIT_SECONDS,
                      repeat: Infinity,
                      ease: "linear",
                    },
                  }
            }
          />
        );
      })}
    </svg>
  );
}
