"use client";

import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { CaretUp } from "@phosphor-icons/react/dist/ssr/CaretUp";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import Link from "next/link";
import type { ReactNode } from "react";
import { Sparkline } from "@/components/charts/charts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatKg } from "@/lib/format";
import type { RangePreset } from "@/lib/use-load";

/** Loading / error wrapper for one widget (board "Manager · widget error"). */
export function WidgetState({
  status,
  onRetry,
  skeleton,
  children,
}: {
  status: "loading" | "error" | "ready";
  onRetry: () => void;
  skeleton: ReactNode;
  children: () => ReactNode;
}) {
  if (status === "loading") return <div aria-busy="true">{skeleton}</div>;
  if (status === "error") {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center gap-2 py-6 text-center"
      >
        <p className="text-small font-semibold text-danger-ink">
          Couldn’t load this
        </p>
        <Button
          variant="secondary"
          size="sm"
          icon={<ArrowClockwise size={16} weight="bold" />}
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    );
  }
  return <>{children()}</>;
}

const RANGES: { key: Exclude<RangePreset, "year" | "all">; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "3months", label: "Last 3 months" },
  { key: "custom", label: "Custom" },
];

/** Segmented date range (header). Custom shows two date inputs. */
export function RangePicker({
  value,
  onChange,
  custom,
  onCustom,
  options = RANGES,
}: {
  value: RangePreset;
  onChange: (r: RangePreset) => void;
  custom: { from: string; to: string };
  onCustom: (c: { from: string; to: string }) => void;
  options?: { key: RangePreset; label: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Date range"
        className="inline-flex gap-0.5 rounded-control bg-track p-[3px]"
      >
        {options.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={value === r.key}
            onClick={() => onChange(r.key)}
            className={cn(
              "h-9 whitespace-nowrap rounded-[9px] px-3.5 text-[13px]",
              value === r.key
                ? "bg-cream font-bold text-deep shadow-card"
                : "font-medium text-ink hover:bg-sage",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      {value === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            aria-label="From"
            value={custom.from}
            max={custom.to || undefined}
            onChange={(e) => onCustom({ ...custom, from: e.target.value })}
            className="h-9 rounded-[9px] bg-surface px-2 text-[13px] shadow-[inset_0_0_0_1px_var(--color-edge)]"
          />
          <span className="text-muted">–</span>
          <input
            type="date"
            aria-label="To"
            value={custom.to}
            min={custom.from || undefined}
            onChange={(e) => onCustom({ ...custom, to: e.target.value })}
            className="h-9 rounded-[9px] bg-surface px-2 text-[13px] shadow-[inset_0_0_0_1px_var(--color-edge)]"
          />
        </div>
      )}
    </div>
  );
}

/** "Needs attention" card: count, one line of context, a link. Red when urgent. */
export function ActionCard({
  title,
  count,
  detail,
  cta,
  href,
  icon,
  tone = "amber",
  urgent,
}: {
  title: string;
  count: number | null;
  detail: string;
  cta: string;
  href: string;
  icon: ReactNode;
  tone?: "amber" | "sage";
  urgent?: boolean;
}) {
  const clear = count === 0;
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col gap-2.5 rounded-card px-5 py-[18px] text-ink no-underline shadow-card hover:brightness-[0.98]",
        urgent && count
          ? "bg-danger-soft shadow-[0_1px_2px_rgba(var(--rgb-shade),0.06),0_8px_24px_rgba(var(--rgb-shade),0.08),inset_0_0_0_1.5px_rgba(var(--rgb-error),0.45)]"
          : "bg-cream hover:bg-row-hover",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-small font-bold">{title}</span>
        <span
          aria-hidden
          className={cn(
            "flex size-9 items-center justify-center rounded-full",
            urgent
              ? "bg-danger-tint text-danger-ink"
              : tone === "sage"
                ? "bg-sage text-deep"
                : "bg-amber-tint text-amber-ink",
          )}
        >
          {icon}
        </span>
      </div>
      <div className="flex items-baseline gap-2.5">
        <span
          className={cn(
            "font-display text-[40px] font-semibold leading-[44px]",
            urgent && count ? "text-danger-ink" : "text-deep",
          )}
        >
          {count ?? "–"}
        </span>
        <span
          className={cn(
            "text-small",
            urgent && count
              ? "font-bold text-danger-ink"
              : "font-medium text-muted",
          )}
        >
          {clear ? (
            <span className="inline-flex items-center gap-1 text-leaf">
              All clear <Check size={14} weight="bold" aria-hidden />
            </span>
          ) : (
            detail
          )}
        </span>
      </div>
      <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-deep">
        {cta}
        <ArrowRight size={14} weight="bold" aria-hidden />
      </span>
    </Link>
  );
}

/** Change vs the previous period. `mode`: percent change, percentage points, or plain difference. */
export function Delta({
  value,
  previous,
  mode,
  label,
  higherIsBetter = true,
}: {
  value: number | null;
  previous: number | null;
  mode: "percent" | "points" | "count";
  label: string;
  higherIsBetter?: boolean;
}) {
  if (value == null || previous == null || !label)
    return (
      <span className="text-[13px] text-muted">
        {label ? `— ${label}` : ""}
      </span>
    );
  let text: string;
  let diff: number;
  if (mode === "percent") {
    if (previous === 0) {
      return (
        <span className="text-[13px] text-muted">
          {value > 0 ? "New" : "—"} {label}
        </span>
      );
    }
    diff = ((value - previous) / previous) * 100;
    text = `${Math.abs(Math.round(diff))}%`;
  } else {
    diff = value - previous;
    text =
      mode === "points"
        ? `${Math.abs(Math.round(diff))} pts`
        : `${formatKg(Math.abs(diff))}`;
  }
  if (Math.round(diff) === 0 && mode !== "count") {
    return (
      <span className="text-[13px] font-bold text-muted">
        No change <span className="font-medium">{label}</span>
      </span>
    );
  }
  const good = diff > 0 === higherIsBetter;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-bold",
        good ? "text-leaf" : "text-error",
      )}
    >
      {diff > 0 ? (
        <CaretUp size={12} weight="fill" aria-label="up" />
      ) : (
        <CaretDown size={12} weight="fill" aria-label="down" />
      )}
      {text}
      <span className="font-medium text-muted">{label}</span>
    </span>
  );
}

/** KPI card: label, big number + unit, sparkline, change vs previous period. */
export function KpiCard({
  label,
  value,
  unit,
  spark,
  delta,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  spark?: { label: string; value: number | null }[];
  delta?: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-card bg-cream p-[18px] shadow-card">
      <span className="text-[13px] font-bold leading-[18px] text-muted">
        {label}
      </span>
      <div className="flex items-end justify-between gap-2">
        <span className="flex items-baseline gap-1">
          <span className="font-display text-[34px] font-semibold leading-10 text-deep">
            {value}
          </span>
          {unit && (
            <span className="text-body font-bold text-deep">{unit}</span>
          )}
        </span>
        {spark && spark.length > 0 && (
          <Sparkline
            points={spark}
            unit={unit === "%" ? "%" : unit ? unit : ""}
          />
        )}
      </div>
      {delta}
      {sub && <span className="text-[13px] text-muted">{sub}</span>}
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-card bg-cream p-[18px] shadow-card">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-20" />
      <Skeleton className="h-4 w-28" />
    </div>
  );
}

/** Board "Manager · first run": three set-up steps until there's data to chart. */
export function FirstRun({
  steps,
}: {
  steps: {
    title: string;
    body: string;
    done: boolean;
    href: string;
    cta: string;
  }[];
}) {
  const done = steps.filter((s) => s.done).length;
  return (
    <section
      aria-labelledby="setup-title"
      className="flex flex-col gap-4 rounded-card bg-cream p-6 shadow-card"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="setup-title"
          className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep"
        >
          Set up LoopSoil
        </h2>
        <p className="text-body text-muted">
          Your charts, calendar and insights appear here once there’s data.
          Three steps to get started:
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
          aria-label={`${done} of ${steps.length} steps done`}
          className="h-2 grow overflow-hidden rounded bg-sage"
        >
          <div
            className="h-full rounded bg-leaf"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
        <span className="whitespace-nowrap text-[13px] font-bold text-deep">
          {done} of {steps.length} done
        </span>
      </div>
      <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
        {steps.map((s, i) => (
          <li
            key={s.title}
            className="flex flex-col gap-2 rounded-control bg-surface p-4 shadow-[inset_0_0_0_1px_rgba(var(--rgb-edge),0.3)]"
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-[13px] font-bold",
                  s.done ? "bg-leaf text-cream" : "bg-sage text-deep",
                )}
              >
                {s.done ? (
                  <Check size={14} weight="bold" aria-label="Done" />
                ) : (
                  i + 1
                )}
              </span>
              <strong>{s.title}</strong>
            </span>
            <p className="grow text-small text-muted">{s.body}</p>
            {s.done ? (
              <span className="inline-flex items-center gap-1.5 text-small font-bold text-leaf">
                <CheckCircle size={16} weight="fill" aria-hidden />
                Done
              </span>
            ) : (
              <Button href={s.href} size="sm" className="self-start px-4">
                {s.cta}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
