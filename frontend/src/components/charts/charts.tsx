"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatKg } from "@/lib/format";

/**
 * LoopSoil chart kit (Dashboard + Reports). Plain SVG/CSS drawn to the design's specs —
 * no charting library, so colours, type and tooltips match the rest of the app exactly.
 * Every chart has a text alternative (role="img" + aria-label) and focusable data points.
 */

const tooltipClass =
  "pointer-events-none invisible absolute z-30 rounded-[10px] bg-cream px-3 py-2.5 text-xs leading-[18px] text-ink opacity-0 shadow-photo transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100";

/** A round axis step giving about `ticks` gridlines: 1, 2, 5, 10, 20, 50 … */
export function niceScale(
  max: number,
  ticks = 5,
): { top: number; step: number; values: number[] } {
  const m = Math.max(max, 1e-9);
  const raw = m / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step =
    (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const top = Math.max(step, Math.ceil(m / step) * step);
  const values = Array.from(
    { length: Math.round(top / step) + 1 },
    (_, i) => Math.round(i * step * 1000) / 1000,
  );
  return { top, step, values };
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

/** KPI card trend: a 96×32 line with a soft fill; hover / focus lists the points. */
export function Sparkline({
  points,
  unit = "",
  label = "Last 7 weeks",
  tone = "leaf",
}: {
  points: { label: string; value: number | null }[];
  unit?: string;
  label?: string;
  tone?: "leaf" | "red";
}) {
  const vals = points.map((p) => p.value ?? 0);
  const max = Math.max(...vals, 0);
  const min = Math.min(...vals, 0);
  const span = max - min || 1;
  const W = 96;
  const H = 32;
  const xy = vals.map((v, i) => [
    points.length === 1 ? W / 2 : (i / (points.length - 1)) * W,
    H - 3 - ((v - min) / span) * (H - 6),
  ]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const stroke = tone === "red" ? "var(--color-error)" : "var(--color-leaf)";
  const desc = points
    .map(
      (p) =>
        `${p.label} ${p.value == null ? "no data" : `${formatKg(p.value)}${unit}`}`,
    )
    .join(", ");
  return (
    <div
      tabIndex={0}
      aria-label={`Trend: ${desc}`}
      className="group relative h-8 w-24 shrink-0 outline-none"
    >
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        aria-hidden
        className="overflow-visible"
      >
        <polygon
          points={`0,${H} ${line} ${W},${H}`}
          style={{ fill: stroke }}
          opacity={0.12}
        />
        <polyline
          points={line}
          fill="none"
          style={{ stroke }}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {xy.length > 0 && (
          <circle
            cx={xy[xy.length - 1][0]}
            cy={xy[xy.length - 1][1]}
            r={3}
            style={{ fill: stroke }}
          />
        )}
      </svg>
      <div
        role="tooltip"
        className={cn(
          tooltipClass,
          "bottom-[calc(100%+8px)] right-0 w-[160px]",
        )}
      >
        <span className="mb-0.5 block font-bold text-deep">{label}</span>
        {points.map((p) => (
          <span key={p.label} className="flex justify-between gap-3">
            <span className="text-muted">{p.label}</span>
            <span className="font-semibold">
              {p.value == null ? "—" : `${formatKg(p.value)}${unit}`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Column chart (single or stacked, optional target + compare) ─────────────

export interface Series {
  key: string;
  label: string;
  color: string;
}

export interface Column {
  key: string;
  /** Axis label under the bar (can be blank to thin out labels). */
  label: string;
  /** Tooltip heading, e.g. "Week of 21 Sep" or "2026-09-A · 20kg". */
  title: string;
  values: Record<string, number>;
  /** Drawn as a dashed tick across the bar (Reports "previous period"). */
  compare?: number;
  href?: string;
}

export function ColumnChart({
  columns,
  series,
  height = 240,
  unit = "kg",
  target,
  compareLabel = "Previous",
  ariaLabel,
  onColumn,
  footer,
}: {
  columns: Column[];
  series: Series[];
  height?: number;
  unit?: string;
  target?: { value: number; label: string };
  compareLabel?: string;
  ariaLabel: string;
  onColumn?: (c: Column) => void;
  footer?: (c: Column) => ReactNode;
}) {
  const totals = columns.map((c) =>
    series.reduce((s, x) => s + (c.values[x.key] ?? 0), 0),
  );
  const { top, values } = niceScale(
    Math.max(
      ...totals,
      ...columns.map((c) => c.compare ?? 0),
      target?.value ?? 0,
      0.1,
    ),
  );
  const px = (v: number) => (v / top) * height;

  return (
    <div>
      <div className="pl-10">
        <div
          role="img"
          aria-label={ariaLabel}
          className="relative"
          style={{ height }}
        >
          {values.map((t) => (
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
          {target && (
            <div
              aria-hidden
              className="absolute inset-x-0 z-10 border-t-2 border-dashed border-soil"
              style={{ bottom: px(target.value) }}
            >
              <span className="absolute -top-5 right-0 rounded bg-cream/90 px-1 text-[11px] font-bold text-soil">
                {target.label}
              </span>
            </div>
          )}
          <div className="absolute inset-0 flex gap-2">
            {columns.map((c, i) => {
              const total = totals[i];
              const summary = `${c.title}: ${series.map((s) => `${s.label} ${formatKg(c.values[s.key] ?? 0)}${unit}`).join(", ")}${c.compare != null ? `, ${compareLabel} ${formatKg(c.compare)}${unit}` : ""}`;
              const Tag = onColumn ? "button" : "div";
              return (
                <Tag
                  key={c.key}
                  type={onColumn ? "button" : undefined}
                  tabIndex={0}
                  aria-label={summary}
                  onClick={onColumn ? () => onColumn(c) : undefined}
                  className={cn(
                    "group relative h-full min-w-0 flex-1 outline-none",
                    onColumn && "cursor-pointer",
                  )}
                >
                  <div
                    className="absolute bottom-0 left-1/2 flex w-[min(56px,70%)] -translate-x-1/2 flex-col-reverse overflow-hidden rounded-t-md group-hover:brightness-110 group-focus-visible:outline-3 group-focus-visible:outline-offset-2 group-focus-visible:outline-leaf"
                    style={{ height: px(total) }}
                  >
                    {series.map((s) => {
                      const v = c.values[s.key] ?? 0;
                      return v > 0 ? (
                        <span
                          key={s.key}
                          style={{ height: px(v), background: s.color }}
                          className="block shrink-0"
                        />
                      ) : null;
                    })}
                  </div>
                  {c.compare != null && (
                    <span
                      aria-hidden
                      className="absolute left-1/2 w-[min(64px,80%)] -translate-x-1/2 border-t-2 border-dashed border-ink/60"
                      style={{ bottom: px(c.compare) }}
                    />
                  )}
                  <div
                    role="tooltip"
                    className={cn(
                      tooltipClass,
                      "left-1/2 w-[190px] -translate-x-1/2",
                    )}
                    style={{ bottom: px(Math.max(total, c.compare ?? 0)) + 10 }}
                  >
                    <strong className="mb-1 block text-small text-deep">
                      {c.title}
                    </strong>
                    {series.map((s) => (
                      <span
                        key={s.key}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="flex items-center gap-1.5 text-muted">
                          <span
                            className="size-2.5 rounded-sm"
                            style={{ background: s.color }}
                          />
                          {s.label}
                        </span>
                        <strong>
                          {formatKg(c.values[s.key] ?? 0)}
                          {unit}
                        </strong>
                      </span>
                    ))}
                    {c.compare != null && (
                      <span className="flex justify-between gap-3">
                        <span className="text-muted">{compareLabel}</span>
                        <strong>
                          {formatKg(c.compare)}
                          {unit}
                        </strong>
                      </span>
                    )}
                    {footer?.(c)}
                  </div>
                </Tag>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex gap-2 pl-10 pt-2">
        {columns.map((c) => (
          <div
            key={c.key}
            className="min-w-0 flex-1 truncate text-center text-xs text-muted"
          >
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Donut ────────────────────────────────────────────────────────────────────

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Ring chart with the headline in the middle and a legend with kg + share. */
export function Donut({
  slices,
  center,
  centerSub,
  ariaLabel,
  size = 168,
  unit = "kg",
  onSlice,
}: {
  slices: Slice[];
  center: ReactNode;
  centerSub?: ReactNode;
  ariaLabel: string;
  size?: number;
  unit?: string;
  onSlice?: (s: Slice) => void;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 12;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div
        role="img"
        aria-label={ariaLabel}
        className="relative shrink-0"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            style={{ stroke: "var(--color-track)" }}
            strokeWidth={20}
          />
          {total > 0 &&
            slices.map((s) => {
              const len = (s.value / total) * circ;
              const el = (
                <circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  style={{ stroke: s.color }}
                  strokeWidth={20}
                  strokeDasharray={`${Math.max(0, len - 1.5)} ${circ}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="font-display text-[26px] font-semibold leading-8 text-deep">
            {center}
          </div>
          {centerSub && <div className="text-xs text-muted">{centerSub}</div>}
        </div>
      </div>
      <ul className="m-0 flex min-w-[140px] grow list-none flex-col gap-1.5 p-0">
        {slices.map((s) => {
          const pct = total ? Math.round((s.value / total) * 100) : 0;
          const body = (
            <>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-[3px]"
                  style={{ background: s.color }}
                />
                {s.label}
              </span>
              <span className="whitespace-nowrap">
                <strong>
                  {formatKg(s.value)}
                  {unit}
                </strong>
                <span className="text-muted"> · {pct}%</span>
              </span>
            </>
          );
          return (
            <li key={s.key}>
              {onSlice ? (
                <button
                  type="button"
                  onClick={() => onSlice(s)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-0.5 text-left text-[13px] hover:bg-sage"
                >
                  {body}
                </button>
              ) : (
                <span className="flex items-center justify-between gap-3 px-1 py-0.5 text-[13px]">
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Horizontal bars ──────────────────────────────────────────────────────────

/** Ranked horizontal bars ("By taker category", "Top recipients"). */
export function HBarList({
  rows,
  unit = "kg",
  color = "var(--color-leaf)",
  ariaLabel,
  shareOfTotal = true,
}: {
  rows: {
    key: string;
    label: string;
    value: number;
    sub?: string;
    href?: string;
  }[];
  unit?: string;
  color?: string;
  ariaLabel: string;
  shareOfTotal?: boolean;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0.0001);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <ul
      aria-label={ariaLabel}
      className="m-0 flex list-none flex-col gap-3 p-0"
    >
      {rows.map((r) => {
        const pct = total ? Math.round((r.value / total) * 100) : 0;
        return (
          <li
            key={r.key}
            tabIndex={0}
            aria-label={`${r.label}: ${formatKg(r.value)}${unit}${shareOfTotal ? `, ${pct}%` : ""}`}
            className="group relative flex flex-col gap-1 outline-none"
          >
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="truncate font-semibold">{r.label}</span>
              <span className="whitespace-nowrap">
                <strong>
                  {formatKg(r.value)}
                  {unit}
                </strong>
                {shareOfTotal && <span className="text-muted"> · {pct}%</span>}
                {r.sub && <span className="text-muted"> · {r.sub}</span>}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-track group-focus-visible:outline-3 group-focus-visible:outline-offset-2 group-focus-visible:outline-leaf">
              <div
                className="h-full rounded-full group-hover:brightness-110"
                style={{
                  width: `${(r.value / max) * 100}%`,
                  background: color,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Legend row used above charts. */
export function Legend({
  items,
}: {
  items: { label: string; color: string; dashed?: boolean }[];
}) {
  return (
    <ul
      aria-label="Legend"
      className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0"
    >
      {items.map((i) => (
        <li
          key={i.label}
          className="flex items-center gap-1.5 text-[13px] text-ink"
        >
          {i.dashed ? (
            <span
              aria-hidden
              className="w-4 border-t-2 border-dashed"
              style={{ borderColor: i.color }}
            />
          ) : (
            <span
              aria-hidden
              className="size-3 rounded-[3px]"
              style={{ background: i.color }}
            />
          )}
          {i.label}
        </li>
      ))}
    </ul>
  );
}
