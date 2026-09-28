"use client";

import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { Leaf } from "@phosphor-icons/react/dist/ssr/Leaf";
import { useEffect, useState } from "react";
import { LeafSprig } from "@/components/brand/illustrations";
import { formatKg } from "@/lib/format";
import { BigButton } from "./handover-ui";
import type { RecordedHandover } from "./record-form";

export const UNDO_SECONDS = 10;

/** Board "Handover · success": the tick, who got what, today's total, and what's next. */
export function SuccessView({
  recorded,
  todayKg,
  nextName,
  onNext,
  onBack,
}: {
  recorded: RecordedHandover;
  todayKg: number | null;
  nextName: string | null;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3.5 px-6 pb-2 pt-10 text-center">
        <div className="relative size-[140px]">
          <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden>
            <circle
              cx="70"
              cy="70"
              r="62"
              style={{ fill: "var(--color-sage)" }}
            />
            <circle
              cx="70"
              cy="70"
              r="62"
              fill="none"
              style={{ stroke: "var(--color-leaf)" }}
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M46 72l16 16 32-34"
              fill="none"
              style={{ stroke: "var(--color-deep)" }}
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="absolute -right-1.5 top-2">
            <LeafSprig width={44} rotate={20} />
          </span>
        </div>
        <h1
          className="font-display m-0 text-[26px] font-semibold leading-8 text-deep"
          role="status"
        >
          Handover recorded
        </h1>
        <p className="text-lg leading-[26px]">
          <strong>{formatKg(recorded.kg)}kg</strong> to {recorded.name}
        </p>
        {todayKg != null && (
          <div className="flex items-center gap-2.5 rounded-card bg-cream px-[18px] py-3.5 shadow-card">
            <Leaf size={22} className="text-leaf" aria-hidden />
            <div className="text-left">
              <span className="text-[13px] text-muted">
                Total diverted today
              </span>
              <div className="font-display text-2xl font-semibold leading-7 text-deep">
                {formatKg(todayKg)}kg
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        {nextName && (
          <BigButton icon={<ArrowRight size={20} />} onClick={onNext}>
            Next pickup · {nextName}
          </BigButton>
        )}
        <BigButton
          variant={nextName ? "secondary" : "primary"}
          onClick={onBack}
        >
          Back to list
        </BigButton>
      </div>
    </div>
  );
}

/** "Handover recorded. 10s [Undo]" — counts down, then disappears. */
export function UndoToast({
  startedAt,
  busy,
  onUndo,
  onExpire,
}: {
  startedAt: number;
  busy: boolean;
  onUndo: () => void;
  onExpire: () => void;
}) {
  const [left, setLeft] = useState(UNDO_SECONDS);
  useEffect(() => {
    const id = setInterval(() => {
      const s = UNDO_SECONDS - Math.floor((Date.now() - startedAt) / 1000);
      if (s <= 0) {
        clearInterval(id);
        onExpire();
      } else setLeft(s);
    }, 250);
    return () => clearInterval(id);
  }, [startedAt, onExpire]);
  return (
    <div className="pointer-events-none fixed inset-x-4 top-[76px] z-[45] flex justify-center md:top-[88px]">
      <div
        role="status"
        className="pointer-events-auto flex w-full max-w-[440px] items-center gap-3 rounded-[14px] bg-deep px-3.5 py-3 text-[15px] font-semibold text-cream shadow-photo"
      >
        <span className="grow">Handover recorded.</span>
        <span className="text-xs opacity-75">{left}s</span>
        <button
          type="button"
          disabled={busy}
          onClick={onUndo}
          className="min-h-11 rounded-[10px] bg-cream/15 px-3.5 text-[15px] font-bold text-cream hover:bg-cream/25 disabled:opacity-60"
        >
          {busy ? "Undoing…" : "Undo"}
        </button>
      </div>
    </div>
  );
}
