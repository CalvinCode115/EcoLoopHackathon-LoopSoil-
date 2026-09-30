"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Scroll-triggered motion for the Awareness page. Both pieces render their FINAL state on
 * the server (so the numbers are right with no JS, for screen readers and for search), then
 * replay the animation once when scrolled near. Nothing animates under reduced motion.
 * They write to the DOM directly instead of React state, so there's no re-render per frame.
 */

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Calls `onEnter` once, just before the element scrolls into view. */
function useOnceInView<T extends Element>(onEnter: (el: T) => void) {
  const ref = useRef<T>(null);
  const cb = useRef(onEnter);
  useEffect(() => {
    cb.current = onEnter;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        cb.current(el);
      },
      // Start slightly before it's visible, so the reset to 0 is never seen.
      { rootMargin: "0px 0px 10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** "649,000" counting up from 0. The prefix/suffix stay put ("~11%", "$342 million"). */
export function CountUp({
  value,
  prefix = "",
  suffix = "",
  durationMs = 1400,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
}) {
  const format = (n: number) =>
    `${prefix}${Math.round(n).toLocaleString("en-SG")}${suffix}`;
  const ref = useOnceInView<HTMLSpanElement>((el) => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      el.textContent = format(value * easeOut(t));
      if (t < 1) requestAnimationFrame(tick);
    };
    el.textContent = format(0);
    requestAnimationFrame(tick);
  });
  return (
    <span ref={ref} className="tabular-nums">
      {format(value)}
    </span>
  );
}

/**
 * A bar that grows from 0 to its width when scrolled to. Pass the final width in `style`
 * (e.g. { width: "18%" }); everything else is ordinary div props.
 */
export function GrowBar({
  className,
  style,
  children,
  durationMs = 1200,
}: {
  className?: string;
  style: CSSProperties & { width: string };
  children?: ReactNode;
  durationMs?: number;
}) {
  const ref = useOnceInView<HTMLDivElement>((el) => {
    el.style.transition = "none";
    el.style.width = "0%";
    void el.offsetWidth; // commit the 0 before transitioning
    el.style.transition = `width ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    el.style.width = style.width;
  });
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
