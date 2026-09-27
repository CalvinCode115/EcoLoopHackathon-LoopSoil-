import { addDays } from "@/lib/batch-form";
import { formatDayMonth, formatKg, sgDayKey } from "@/lib/format";
import {
  REJECTION_REASON_MANAGER_LABEL,
  TAKER_CATEGORY_LABEL,
} from "@/lib/labels";
import type { ReportData } from "@/lib/types";
import {
  RANGE_COMPARE_LABEL,
  rangeBounds,
  type RangePreset,
} from "@/lib/use-load";

/** Everything the Reports filter bar holds (also what a saved view stores). */
export interface ReportFilters {
  range: RangePreset;
  custom: { from: string; to: string };
  compare: boolean;
  batchId: string;
  takerType: "" | "INDIVIDUAL" | "BULK";
  category: string;
}

export function defaultFilters(today: string): ReportFilters {
  return {
    range: "month",
    custom: { from: addDays(today, -29), to: today },
    compare: true,
    batchId: "",
    takerType: "",
    category: "",
  };
}

/** Query string for /reporting/report and /reporting/analytics. */
export function filterQuery(f: ReportFilters, now: number): string {
  const b = rangeBounds(f.range, now, f.custom);
  const q = new URLSearchParams();
  if (b.from) q.set("from", b.from);
  q.set("to", b.to);
  if (f.batchId) q.set("batchId", f.batchId);
  if (f.takerType) q.set("takerType", f.takerType);
  if (f.category) q.set("category", f.category);
  return q.toString();
}

export const RANGE_LABEL: Record<RangePreset, string> = {
  week: "This week",
  month: "This month",
  "3months": "Last 3 months",
  year: "This year",
  all: "All time",
  custom: "Custom",
};

/** "This month · 1–29 Sep 2026" */
export function periodText(f: ReportFilters, now: number): string {
  const b = rangeBounds(f.range, now, f.custom);
  if (!b.from) return "All time";
  const from = new Date(b.from).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
  });
  const to = new Date(b.to).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  });
  return `${RANGE_LABEL[f.range]} · ${from} – ${to}`;
}

export function compareLabel(f: ReportFilters): string {
  return RANGE_COMPARE_LABEL[f.range] || "vs previous period";
}

export const GROUP_LABEL: Record<string, string> = {
  INDIVIDUAL: "Individuals",
  ...TAKER_CATEGORY_LABEL,
};

// ─── CSV ──────────────────────────────────────────────────────────────────────

export interface CsvTable {
  filename: string;
  header: string[];
  rows: (string | number | null)[][];
}

export function toCsv(t: CsvTable): string {
  const cell = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [t.header, ...t.rows].map((r) => r.map(cell).join(",")).join("\n");
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(t: CsvTable) {
  // BOM so Excel opens UTF-8 (× · –) correctly.
  downloadBlob(
    t.filename,
    new Blob(["﻿" + toCsv(t)], { type: "text/csv;charset=utf-8" }),
  );
}

// ─── Time buckets for "kg diverted over time" ────────────────────────────────

export type Granularity = "daily" | "weekly" | "monthly" | "cumulative";

function mondayOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

/** Bucket daily kg; the previous period is aligned bucket-by-bucket (same offset). */
export function bucketSeries(
  data: ReportData,
  g: Granularity,
): {
  key: string;
  label: string;
  title: string;
  kg: number;
  previous: number;
}[] {
  const from = sgDayKey(data.period.from);
  const to = sgDayKey(data.period.to);
  const prevFrom = sgDayKey(data.previousPeriod.from);
  const offsetDays = Math.round(
    (new Date(from).getTime() - new Date(prevFrom).getTime()) / 86_400_000,
  );
  const kgOn = (rows: ReportData["daily"]) =>
    new Map(rows.map((r) => [r.day, r.kg]));
  const cur = kgOn(data.daily);
  const prev = kgOn(data.previousDaily);
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 800; d = addDays(d, 1))
    days.push(d);

  const keyOf = (day: string) =>
    g === "monthly" ? day.slice(0, 7) : g === "daily" ? day : mondayOf(day);
  const buckets = new Map<string, { kg: number; previous: number }>();
  for (const day of days) {
    const k = g === "cumulative" ? mondayOf(day) : keyOf(day);
    const b = buckets.get(k) ?? { kg: 0, previous: 0 };
    b.kg += cur.get(day) ?? 0;
    b.previous += prev.get(addDays(day, -offsetDays)) ?? 0;
    buckets.set(k, b);
  }
  let runKg = 0;
  let runPrev = 0;
  return [...buckets.entries()].map(([k, b]) => {
    if (g === "cumulative") {
      runKg += b.kg;
      runPrev += b.previous;
    }
    const kg = Math.round((g === "cumulative" ? runKg : b.kg) * 100) / 100;
    const previous =
      Math.round((g === "cumulative" ? runPrev : b.previous) * 100) / 100;
    const date = `${g === "monthly" ? `${k}-01` : k}T12:00:00+08:00`;
    const label =
      g === "monthly"
        ? new Date(date).toLocaleDateString("en-SG", {
            month: "short",
            timeZone: "Asia/Singapore",
          })
        : formatDayMonth(date);
    const title =
      g === "daily"
        ? formatDayMonth(date)
        : g === "monthly"
          ? label
          : `Week of ${formatDayMonth(date)}`;
    return { key: k, label, title, kg, previous };
  });
}

// ─── Insights (rule-based) ────────────────────────────────────────────────────

export interface Insight {
  title: string;
  detail: string;
}

const WEEKDAY = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function bandLabel(band: number): string {
  const f = (h: number) =>
    h === 0 || h === 24
      ? "12am"
      : h === 12
        ? "12pm"
        : h > 12
          ? `${h - 12}pm`
          : `${h}am`;
  const a = f(band);
  const b = f(band + 2);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -2)}–${b}` : `${a}–${b}`;
}

export function busiestSlot(data: ReportData) {
  const cells = data.pickups.heatmap.filter((c) => c.capacity > 0);
  if (!cells.length) return null;
  const best = [...cells].sort(
    (a, b) => b.booked / b.capacity - a.booked / a.capacity,
  )[0];
  return {
    ...best,
    pct: Math.round((best.booked / best.capacity) * 100),
    label: `${WEEKDAY_SHORT[best.weekday]} ${bandLabel(best.band)}`,
    day: WEEKDAY[best.weekday],
  };
}

export function buildInsights(
  data: ReportData,
  kg: { value: number | null; previous: number | null },
  label: string,
): Insight[] {
  const out: Insight[] = [];
  const total = data.daily.reduce((s, d) => s + d.kg, 0);
  if (kg.value != null && kg.previous) {
    const pct = Math.round(((kg.value - kg.previous) / kg.previous) * 100);
    if (pct !== 0) {
      const top = data.topRecipients[0];
      out.push({
        title: `kg diverted is ${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% ${label}.`,
        detail: top
          ? `${top.name} collected the most this period (${formatKg(top.kg)}kg).`
          : "",
      });
    }
  }
  const top = data.topRecipients[0];
  if (top && total > 0) {
    const bulk = data.topRecipients
      .filter((r) => r.type === "BULK")
      .reduce((s, r) => s + r.kg, 0);
    out.push({
      title: `${top.name} received ${Math.round((top.kg / total) * 100)}% of all compost this period.`,
      detail: `${formatKg(top.kg)}kg of ${formatKg(total)}kg · Bulk takers overall took ${Math.round((bulk / total) * 100)}%.`,
    });
  }
  const reasons = Object.entries(data.rejectionReasons).sort(
    (a, b) => b[1] - a[1],
  );
  if (reasons.length) {
    const [reason] = reasons[0];
    out.push({
      title: `Most claims are rejected for “${REJECTION_REASON_MANAGER_LABEL[reason as keyof typeof REJECTION_REASON_MANAGER_LABEL] ?? reason}”.`,
      detail:
        reason === "INSUFFICIENT_SUPPLY"
          ? "Demand is higher than supply — consider more top-ups."
          : `${reasons[0][1]} of ${data.funnel.rejected} rejections this period.`,
    });
  }
  const busy = busiestSlot(data);
  if (busy && busy.pct >= 50) {
    out.push({
      title: `${busy.day} ${bandLabel(busy.band)} slots fill fastest.`,
      detail: `Average ${busy.pct}% full${busy.pct >= 80 ? ` · consider adding a second ${busy.day} slot.` : "."}`,
    });
  }
  const resolved = data.funnel.collected.count + data.funnel.noShows;
  if (resolved >= 5 && data.funnel.noShows / resolved >= 0.15) {
    out.push({
      title: `${Math.round((data.funnel.noShows / resolved) * 100)}% of booked pickups were no-shows.`,
      detail: "Consider WhatsApp reminders the day before.",
    });
  }
  return out.slice(0, 4);
}
