import { cn } from "@/lib/cn";
import { formatKg } from "@/lib/format";
import { STOCK_COLORS } from "./stock-bar";

export interface WaterfallStep {
  label: string;
  /** Shown as "Label · value" in the tooltip; negative steps render as "−5kg". */
  kg: number;
  /** "total" bars stand on the axis; "minus" bars float between the previous and next level. */
  kind: "total" | "minus";
  color: string;
  detail: string;
}

const CHART_H = 240;

/**
 * "Where the kg goes" (Manager · Batch detail): Total → − reserve → − bulk → Public pool →
 * − claimed → Remaining. Totals stand on the axis, deductions float, dashed connectors carry
 * each level across. Every step is focusable and shows its details on hover/focus.
 */
export function KgWaterfall({ steps }: { steps: WaterfallStep[] }) {
  const max = Math.max(
    1,
    ...steps.filter((s) => s.kind === "total").map((s) => s.kg),
  );
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from(
    { length: Math.round(top / step) + 1 },
    (_, i) => i * step,
  );
  const px = (kg: number) => (kg / top) * CHART_H;

  // Walk the levels: a total sets the level, a deduction lowers it from the previous one.
  const bars = steps.reduce<
    (WaterfallStep & { bottom: number; height: number; after: number })[]
  >((acc, s) => {
    if (s.kind === "total")
      return [...acc, { ...s, bottom: 0, height: px(s.kg), after: s.kg }];
    const from = acc.length ? acc[acc.length - 1].after : 0;
    const after = Math.max(0, from - s.kg);
    return [
      ...acc,
      { ...s, bottom: px(after), height: px(from - after), after },
    ];
  }, []);

  const summary = bars
    .map((b) =>
      b.kind === "total"
        ? `${formatKg(b.kg)}kg ${b.label.toLowerCase()}`
        : `minus ${formatKg(b.kg)} ${b.label.toLowerCase()}`,
    )
    .join(", ");

  return (
    <div>
      <div className="pl-10">
        <div
          role="img"
          aria-label={`kg waterfall: ${summary}`}
          className="relative"
          style={{ height: CHART_H }}
        >
          {ticks.map((t) => (
            <div key={t} aria-hidden>
              <div
                className={cn(
                  "absolute inset-x-0 h-px",
                  t === 0
                    ? "bg-[rgba(var(--rgb-hair),0.4)]"
                    : "bg-[rgba(var(--rgb-hair),0.18)]",
                )}
                style={{ bottom: px(t) }}
              />
              <span
                className="absolute -left-[34px] w-[26px] text-right text-xs text-muted"
                style={{ bottom: px(t) - 8 }}
              >
                {formatKg(t)}
              </span>
            </div>
          ))}
          <div className="absolute inset-0 flex">
            {bars.map((b, i) => {
              const value =
                b.kind === "minus" && b.kg > 0
                  ? `−${formatKg(b.kg)}kg`
                  : `${formatKg(b.kg)}kg`;
              const topPx = b.bottom + b.height;
              return (
                <div
                  key={b.label}
                  tabIndex={0}
                  aria-label={`${b.label}: ${value}. ${b.detail}`}
                  className="group relative h-full flex-1 outline-none"
                >
                  <div
                    className={cn(
                      "absolute left-1/2 w-[min(72px,70%)] -translate-x-1/2 group-hover:brightness-110 group-focus-visible:outline-3 group-focus-visible:outline-offset-2 group-focus-visible:outline-leaf",
                      b.kind === "total" ? "rounded-t" : "rounded",
                    )}
                    style={{
                      bottom: b.bottom,
                      height: Math.max(b.height, b.kg > 0 ? 2 : 0),
                      background: b.color,
                    }}
                  />
                  <span
                    aria-hidden
                    className="absolute inset-x-0 text-center text-small font-bold text-ink"
                    style={{ bottom: topPx + 6 }}
                  >
                    {value}
                  </span>
                  {i < bars.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute left-[calc(50%+min(36px,35%))] w-[calc(100%-min(72px,70%))] border-t-[1.5px] border-dashed border-[rgba(var(--rgb-hair),0.5)]"
                      style={{ bottom: px(b.after) }}
                    />
                  )}
                  <div
                    role="tooltip"
                    className="pointer-events-none invisible absolute left-1/2 z-20 w-[210px] -translate-x-1/2 rounded-control bg-cream p-3 text-xs leading-[18px] opacity-0 shadow-photo transition-opacity group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100"
                    style={{ bottom: topPx + 34 }}
                  >
                    <strong className="block text-small text-deep">
                      {b.label} · {value}
                    </strong>
                    <span className="text-muted">{b.detail}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex pl-10 pt-2.5">
        {bars.map((b) => (
          <div
            key={b.label}
            className={cn(
              "flex-1 text-center text-[13px]",
              b.kind === "total"
                ? "font-bold text-ink"
                : "font-medium text-muted",
            )}
          >
            {b.kind === "minus" ? `minus ${b.label}` : b.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A round tick step giving at most ~6 gridlines: 1, 2, 5, 10, 20, 50 … */
function niceStep(max: number): number {
  const raw = max / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/** The six steps for a batch pool (colours match the stock bar). */
export function batchWaterfallSteps(input: {
  pool: {
    totalKg: number;
    schoolReserveKg: number;
    allocatedKg: number;
    publicPoolKg: number;
    pendingClaimKg: number;
    approvedClaimKg: number;
    collectedClaimKg: number;
    kgRemaining: number;
  };
  totalDetail: string;
  bulkDetail: string;
}): WaterfallStep[] {
  const { pool } = input;
  const claimed = pool.pendingClaimKg + pool.approvedClaimKg;
  const awaiting = Math.max(0, pool.approvedClaimKg - pool.collectedClaimKg);
  const claimedParts = [
    pool.pendingClaimKg > 0 && `${formatKg(pool.pendingClaimKg)}kg pending`,
    awaiting > 0 && `${formatKg(awaiting)}kg approved, awaiting pickup`,
    pool.collectedClaimKg > 0 &&
      `${formatKg(pool.collectedClaimKg)}kg collected`,
  ].filter(Boolean);
  return [
    {
      label: "Total harvested",
      kg: pool.totalKg,
      kind: "total",
      color: "var(--color-deep)",
      detail: input.totalDetail,
    },
    {
      label: "School reserve",
      kg: pool.schoolReserveKg,
      kind: "minus",
      color: STOCK_COLORS.reserve,
      detail: "Set aside for the SUSS rooftop garden",
    },
    {
      label: "Bulk allocations",
      kg: pool.allocatedKg,
      kind: "minus",
      color: STOCK_COLORS.bulk,
      detail: input.bulkDetail,
    },
    {
      label: "Public pool",
      kg: pool.publicPoolKg,
      kind: "total",
      color: "var(--color-leaf)",
      detail: "Open to individual takers",
    },
    {
      label: "Claimed",
      kg: claimed,
      kind: "minus",
      color: STOCK_COLORS.claimed,
      detail: claimedParts.length
        ? claimedParts.join(" · ")
        : "No approved claims yet",
    },
    {
      label: "Remaining",
      kg: Math.max(0, pool.kgRemaining),
      kind: "total",
      color: STOCK_COLORS.remaining,
      detail: "Still available to claim",
    },
  ];
}
