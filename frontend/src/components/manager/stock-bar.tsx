"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { formatKg } from "@/lib/format";
import type { BatchPool } from "@/lib/types";

/** Stock segment colours (Manager components → chart / Batches legend). */
export const STOCK_COLORS = {
  reserve: "var(--color-chart-reserve)",
  bulk: "var(--color-chart-bulk)",
  claimed: "var(--color-chart-claimed)",
  collected: "var(--color-chart-collected)",
  remaining: "var(--color-chart-remaining)",
} as const;

export const STOCK_LABELS = {
  reserve: "School reserve",
  bulk: "Bulk allocations",
  claimed: "Claimed",
  collected: "Collected",
  remaining: "Remaining",
} as const;

type Segment = keyof typeof STOCK_COLORS;

/**
 * Where every kg of a batch is, as five parts that add up to the total:
 * school reserve · bulk allocations (not yet collected) · claimed (pending + approved,
 * not yet collected) · collected · remaining (free for new claims).
 */
export function stockSegments(pool: BatchPool): Record<Segment, number> {
  return {
    reserve: pool.schoolReserveKg,
    bulk: Math.max(0, pool.allocatedKg - pool.collectedAllocationKg),
    claimed: Math.max(
      0,
      pool.pendingClaimKg + pool.approvedClaimKg - pool.collectedClaimKg,
    ),
    collected: pool.collectedKg,
    remaining: Math.max(0, pool.kgRemaining),
  };
}

/** One-line legend chips. */
export function StockLegend({ className }: { className?: string }) {
  return (
    <ul
      aria-label="Legend"
      className={cn(
        "m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0",
        className,
      )}
    >
      {(Object.keys(STOCK_COLORS) as Segment[]).map((k) => (
        <li key={k} className="flex items-center gap-1.5 text-[13px] text-ink">
          <span
            aria-hidden
            className="size-3 rounded-[3px]"
            style={{ background: STOCK_COLORS[k] }}
          />
          {STOCK_LABELS[k]}
        </li>
      ))}
    </ul>
  );
}

/**
 * Stacked stock bar with "Xkg remaining" under it; hovering or focusing shows the
 * breakdown card (design: "hover on stock bar").
 */
export function StockBar({
  reference,
  pool,
}: {
  reference: string;
  pool: BatchPool;
}) {
  const tipId = useId();
  const seg = stockSegments(pool);
  const keys = (Object.keys(seg) as Segment[]).filter((k) => seg[k] > 0);
  const summary = (Object.keys(seg) as Segment[])
    .map((k) => `${STOCK_LABELS[k]} ${formatKg(seg[k])}kg`)
    .join(", ");

  return (
    <div
      tabIndex={0}
      aria-label={`${reference} stock: ${summary}`}
      aria-describedby={tipId}
      className="group relative flex min-w-[200px] flex-col gap-1 rounded outline-none focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-leaf"
    >
      <div className="flex h-3 gap-0.5 overflow-hidden rounded bg-sage">
        {keys.map((k) => (
          <span
            key={k}
            className="h-full"
            style={{ flex: `${seg[k]} 1 0`, background: STOCK_COLORS[k] }}
          />
        ))}
      </div>
      <span className="text-xs text-muted">
        <strong className="text-ink">{formatKg(seg.remaining)}kg</strong>{" "}
        remaining
      </span>
      <div
        id={tipId}
        role="tooltip"
        className="invisible absolute left-0 top-[calc(100%+10px)] z-30 flex w-[220px] flex-col gap-1 rounded-control bg-cream p-3 text-xs leading-[18px] opacity-0 shadow-photo transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        <span className="flex justify-between text-[13px]">
          <strong className="text-deep">{reference}</strong>
          <strong>{formatKg(pool.totalKg)}kg total</strong>
        </span>
        {(Object.keys(seg) as Segment[]).map((k) => (
          <span key={k} className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-[3px]"
              style={{ background: STOCK_COLORS[k] }}
            />
            <span className="flex-1 text-muted">{STOCK_LABELS[k]}</span>
            <strong>{formatKg(seg[k])}kg</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
