"use client";

import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { MagnifyingGlassPlus } from "@phosphor-icons/react/dist/ssr/MagnifyingGlassPlus";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { Shot, Step } from "./tutorial-content";

/** Design pixel size of each phone's screen; markers are stored in these units. */
const SCREEN = { lg: { w: 260, h: 708 }, sm: { w: 150, h: 408 } } as const;

/** Red numbered dot — on the screenshot and in the action list. */
export function MarkerDot({
  n,
  size = 26,
  active = false,
  className,
}: {
  n: number;
  size?: 22 | 24 | 26;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-error font-bold text-white shadow-[0_0_0_2px_#fff] transition-transform",
        size === 26 ? "text-sm" : "text-[13px]",
        active &&
          "scale-[1.3] shadow-[0_0_0_2px_#fff,0_0_0_5px_rgba(180,67,47,0.3)]",
        className,
      )}
    >
      {n}
    </span>
  );
}

/**
 * Phone frame around a screenshot, with the step's markers pinned on it. The whole frame
 * is a button that opens the lightbox. Hovering a marker highlights its action.
 */
export function PhoneMockup({
  shot,
  activeMarker,
  onMarkerHover,
  onOpen,
  width,
}: {
  shot: Shot;
  activeMarker?: number | null;
  onMarkerHover?: (n: number | null) => void;
  onOpen?: () => void;
  /** Rendered screen width; defaults to the design size for the phone type. */
  width?: number;
}) {
  const base = SCREEN[shot.size];
  const w = width ?? base.w;
  const h = (w * base.h) / base.w;
  const big = shot.size === "lg";

  return (
    <figure className="m-0 flex shrink-0 flex-col items-center gap-2.5">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Enlarge screenshot: ${shot.alt}`}
        className={cn(
          "relative block bg-[#1F2A1A] shadow-[0_0_0_2px_#3A4A30,0_24px_48px_rgba(31,42,26,0.25)]",
          big ? "rounded-[46px] p-[11px]" : "rounded-[32px] p-[9px]",
        )}
      >
        {/* notch */}
        <span
          aria-hidden
          className={cn(
            "absolute left-1/2 z-[3] -translate-x-1/2 rounded-md bg-[#1F2A1A]",
            big ? "top-[17px] h-[9px] w-[31%]" : "top-[15px] h-[7px] w-[28%]",
          )}
        />
        <span
          className={cn(
            "relative block overflow-hidden bg-beige",
            big ? "rounded-[36px]" : "rounded-3xl",
          )}
          style={{ width: w, height: h }}
        >
          <Image
            src={shot.src}
            alt=""
            fill
            sizes={`${Math.ceil(w)}px`}
            className="object-cover"
          />
          {shot.markers.map((m) => (
            <span
              key={m.n}
              className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${(m.x / base.w) * 100}%`,
                top: `${(m.y / base.h) * 100}%`,
              }}
              onMouseEnter={() => onMarkerHover?.(m.n)}
              onMouseLeave={() => onMarkerHover?.(null)}
            >
              <MarkerDot
                n={m.n}
                active={activeMarker === m.n}
                className="shadow-[0_0_0_2px_#fff,0_2px_6px_rgba(0,0,0,0.25)]"
              />
            </span>
          ))}
        </span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 rounded-control bg-sage px-2.5 py-1 text-xs font-bold text-deep"
      >
        <MagnifyingGlassPlus size={16} weight="bold" /> Tap to enlarge
      </button>
      {shot.label && (
        <span className="text-center text-eyebrow font-bold uppercase tracking-[0.06em] text-muted">
          {shot.label}
        </span>
      )}
    </figure>
  );
}

/**
 * "Tutorial / Lightbox": dark overlay, the screenshot at 290px wide with its markers, the
 * step's title and numbered actions beside it, previous/next through every screenshot.
 * Esc or the close button closes it; focus returns to where it was.
 */
export function Lightbox({
  shot,
  step,
  onClose,
  onPrev,
  onNext,
}: {
  shot: Shot;
  step: Step;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev?.();
      if (e.key === "ArrowRight") onNext?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  // Actions pinned on this screenshot; a marker-less shot shows the whole step.
  const pinned = new Set(shot.markers.map((m) => m.n));
  const actions = step.actions
    .map((text, i) => ({ n: i + 1, text }))
    .filter((a) => pinned.size === 0 || pinned.has(a.n));

  const navBtn =
    "flex size-[52px] shrink-0 items-center justify-center rounded-full bg-cream/16 text-white hover:bg-cream/25 disabled:opacity-30";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Screenshot, step ${step.n}: ${step.title}`}
      className="fixed inset-0 z-[90] flex items-center justify-center gap-4 overflow-y-auto bg-[rgba(20,26,16,0.9)] p-4 md:gap-10"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <button
        ref={closeRef}
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={cn(navBtn, "absolute right-4 top-4 md:right-7 md:top-7")}
      >
        <X size={26} />
      </button>
      <button
        type="button"
        aria-label="Previous screenshot"
        onClick={onPrev}
        disabled={!onPrev}
        className={cn(navBtn, "hidden md:flex")}
      >
        <CaretLeft size={28} />
      </button>

      <div className="flex flex-col items-center gap-6 md:flex-row md:gap-10">
        <div className="relative rounded-[46px] bg-[#1F2A1A] p-[11px] shadow-[0_0_0_2px_#3A4A30,0_24px_48px_rgba(31,42,26,0.25)]">
          <span
            className="relative block h-[min(789px,70dvh)] overflow-hidden rounded-[36px] bg-beige"
            style={{
              aspectRatio: shot.size === "lg" ? "260 / 708" : "150 / 408",
            }}
          >
            <Image
              src={shot.src}
              alt={shot.alt}
              fill
              sizes="290px"
              className="object-cover"
            />
            {shot.markers.map((m) => (
              <span
                key={m.n}
                className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${(m.x / SCREEN[shot.size].w) * 100}%`,
                  top: `${(m.y / SCREEN[shot.size].h) * 100}%`,
                }}
              >
                <MarkerDot n={m.n} />
              </span>
            ))}
          </span>
        </div>

        <div className="flex w-[300px] max-w-full flex-col gap-3 text-cream">
          <span className="text-[13px] font-bold uppercase tracking-[0.08em] opacity-70">
            Step {step.n} of 7
          </span>
          <h2 className="font-display m-0 text-[28px] font-semibold leading-9 text-cream">
            {step.title}
          </h2>
          {actions.map((a) => (
            <p key={a.n} className="flex gap-2.5 text-[15px] leading-[22px]">
              <MarkerDot n={a.n} size={24} />
              <span>{a.text}</span>
            </p>
          ))}
          <div className="mt-2 flex gap-3 md:hidden">
            <button
              type="button"
              aria-label="Previous screenshot"
              onClick={onPrev}
              disabled={!onPrev}
              className={navBtn}
            >
              <CaretLeft size={28} />
            </button>
            <button
              type="button"
              aria-label="Next screenshot"
              onClick={onNext}
              disabled={!onNext}
              className={navBtn}
            >
              <CaretRight size={28} />
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-label="Next screenshot"
        onClick={onNext}
        disabled={!onNext}
        className={cn(navBtn, "hidden md:flex")}
      >
        <CaretRight size={28} />
      </button>
    </div>
  );
}
