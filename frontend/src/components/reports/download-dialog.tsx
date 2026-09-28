"use client";

import { FilePdf } from "@phosphor-icons/react/dist/ssr/FilePdf";
import { FileCsv } from "@phosphor-icons/react/dist/ssr/FileCsv";
import { useState } from "react";
import { SheetActions } from "@/components/manager/batch-detail/batch-sheets";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { formatKg } from "@/lib/format";
import {
  CANCELLATION_REASON_LABEL,
  REJECTION_REASON_MANAGER_LABEL,
} from "@/lib/labels";
import type { AnalyticsReport, Handover, ReportData } from "@/lib/types";
import { logCsv } from "./handover-log";
import {
  GROUP_LABEL,
  bandLabel,
  downloadCsv,
  type CsvTable,
} from "./report-model";

export const SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "impact", label: "Impact" },
  { key: "supply", label: "Supply & stock" },
  { key: "funnel", label: "Claims funnel" },
  { key: "pickups", label: "Pickups" },
  { key: "takers", label: "Takers" },
  { key: "log", label: "Handover log" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];

type ReportType = "diary" | "impact" | "full" | "custom";
const TYPES: {
  key: ReportType;
  label: string;
  hint: string;
  sections: SectionKey[];
}[] = [
  {
    key: "diary",
    label: "Waste Diary",
    hint: "Handover log + total kg · for SUSS records",
    sections: ["overview", "log"],
  },
  {
    key: "impact",
    label: "Impact summary",
    hint: "Headline numbers, key charts, insights · for sharing",
    sections: ["overview", "impact"],
  },
  {
    key: "full",
    label: "Full analytics report",
    hint: "Every section",
    sections: SECTIONS.map((s) => s.key),
  },
  {
    key: "custom",
    label: "Custom",
    hint: "Pick sections",
    sections: ["overview"],
  },
];

/**
 * "Download report" (boards "Reports · download / custom / error / generating"). PDF opens
 * the print-styled report in a new tab and uses the browser's Save as PDF; CSV downloads one
 * file per chosen section, built from the data already on screen.
 */
export function DownloadDialog({
  periodLabel,
  monthLabel,
  data,
  analytics,
  handovers,
  printHref,
  onClose,
}: {
  periodLabel: string;
  monthLabel: string;
  data: ReportData;
  analytics: AnalyticsReport;
  handovers: Handover[];
  printHref: (opts: {
    sections: SectionKey[];
    photos: boolean;
    title: string;
    logos: boolean;
  }) => string;
  onClose: () => void;
}) {
  const [type, setType] = useState<ReportType>("diary");
  const [custom, setCustom] = useState<SectionKey[]>([
    "overview",
    "impact",
    "pickups",
  ]);
  const [photos, setPhotos] = useState(true);
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const [title, setTitle] = useState(`LoopSoil Waste Diary — ${monthLabel}`);
  const [logos, setLogos] = useState(true);
  const sections =
    type === "custom" ? custom : TYPES.find((t) => t.key === type)!.sections;
  const kg = analytics.kpis.kgDiverted.value ?? 0;
  const photoCount = handovers.filter((h) => h.photoUrl).length;

  function pickType(t: ReportType) {
    setType(t);
    const name = TYPES.find((x) => x.key === t)!.label.replace(
      "Full analytics report",
      "Analytics report",
    );
    setTitle(`LoopSoil ${name} — ${monthLabel}`);
  }

  function download() {
    if (format === "pdf") {
      window.open(
        printHref({
          sections,
          photos: photos && sections.includes("log"),
          title,
          logos,
        }),
        "_blank",
        "noopener",
      );
      onClose();
      return;
    }
    for (const t of csvFor(sections, data, analytics, handovers))
      downloadCsv(t);
    onClose();
  }

  return (
    <Sheet
      labelledBy="download-title"
      onClose={onClose}
      className="md:max-w-[860px]"
    >
      <h3
        id="download-title"
        className="font-display m-0 text-[22px] font-semibold text-deep"
      >
        Download report
      </h3>
      <div className="grid gap-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <fieldset className="m-0 flex flex-col gap-2 border-none p-0">
            <legend className="mb-2 text-small font-bold">
              1. Report type
            </legend>
            <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
              {TYPES.map((t) => (
                <label
                  key={t.key}
                  className={cn(
                    "flex cursor-pointer gap-2.5 rounded-control bg-surface p-3",
                    type === t.key
                      ? "shadow-[inset_0_0_0_2px_var(--color-leaf)]"
                      : "shadow-[inset_0_0_0_1px_rgba(var(--rgb-edge),0.4)]",
                  )}
                >
                  <input
                    type="radio"
                    name="rtype"
                    checked={type === t.key}
                    onChange={() => pickType(t.key)}
                    className="mt-1 accent-[var(--color-leaf)]"
                  />
                  <span className="flex flex-col">
                    <strong className="text-small">{t.label}</strong>
                    <span className="text-xs text-muted">{t.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="m-0 flex flex-col gap-2 border-none p-0">
            <legend className="mb-2 text-small font-bold">
              2. Sections{" "}
              {type !== "custom" && (
                <span className="font-normal text-muted">
                  · set by report type
                </span>
              )}
            </legend>
            <div className="flex flex-wrap gap-2">
              {SECTIONS.map((s) => {
                const on = sections.includes(s.key);
                return (
                  <label
                    key={s.key}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-semibold",
                      on
                        ? "bg-sage text-deep"
                        : "bg-surface shadow-[inset_0_0_0_1px_rgba(var(--rgb-edge),0.4)]",
                      type !== "custom" && "opacity-80",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={type !== "custom"}
                      onChange={() =>
                        setCustom((c) =>
                          c.includes(s.key)
                            ? c.filter((x) => x !== s.key)
                            : [...c, s.key],
                        )
                      }
                      className="accent-[var(--color-leaf)]"
                    />
                    {s.label}
                  </label>
                );
              })}
            </div>
            <label className="inline-flex items-center gap-2 text-[13px] font-semibold">
              <input
                type="checkbox"
                checked={photos}
                disabled={!sections.includes("log") || format === "csv"}
                onChange={(e) => setPhotos(e.target.checked)}
                className="accent-[var(--color-leaf)]"
              />
              Include weigh-in photos
            </label>
          </fieldset>
          <fieldset className="m-0 flex flex-col gap-3 border-none p-0">
            <legend className="mb-2 text-small font-bold">3. Options</legend>
            <p className="text-[13px] text-muted">
              Period: <strong className="text-ink">{periodLabel}</strong> ·
              change it with the filters on the page.
            </p>
            <div role="radiogroup" className="grid grid-cols-2 gap-2">
              {(
                [
                  [
                    "pdf",
                    "PDF",
                    "Formatted, with charts · Save as PDF from the print dialog",
                    <FilePdf key="p" size={22} />,
                  ],
                  [
                    "csv",
                    "CSV",
                    "Raw data · one file per section",
                    <FileCsv key="c" size={22} />,
                  ],
                ] as const
              ).map(([k, label, hint, icon]) => (
                <label
                  key={k}
                  className={cn(
                    "flex cursor-pointer gap-2.5 rounded-control bg-surface p-3",
                    format === k
                      ? "shadow-[inset_0_0_0_2px_var(--color-leaf)]"
                      : "shadow-[inset_0_0_0_1px_rgba(var(--rgb-edge),0.4)]",
                  )}
                >
                  <input
                    type="radio"
                    name="fmt"
                    checked={format === k}
                    onChange={() => setFormat(k)}
                    className="sr-only"
                  />
                  <span className="text-deep">{icon}</span>
                  <span className="flex flex-col">
                    <strong className="text-small">{label}</strong>
                    <span className="text-xs text-muted">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {format === "pdf" && (
              <>
                <Field
                  id="rep-title"
                  label="Report title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                />
                <label className="inline-flex items-center gap-2 text-[13px] font-semibold">
                  <input
                    type="checkbox"
                    checked={logos}
                    onChange={(e) => setLogos(e.target.checked)}
                    className="accent-[var(--color-leaf)]"
                  />
                  Include LoopSoil × SUSS logos on the cover
                </label>
              </>
            )}
          </fieldset>
        </div>
        <aside
          aria-label="Preview"
          className="flex flex-col gap-3 rounded-card bg-well p-4"
        >
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
            Preview
          </span>
          <div className="flex flex-col gap-1 rounded-control bg-deep p-4 text-cream">
            <strong className="font-display text-lg">
              {format === "pdf" ? title : "CSV files"}
            </strong>
            <span className="text-xs text-cream/80">{monthLabel}</span>
            <span className="font-display mt-2 text-[28px] font-semibold">
              {formatKg(kg)} kg
            </span>
            <span className="text-xs text-cream/80">
              diverted in this period
            </span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
            {format === "pdf" && <li>Cover</li>}
            {sections.map((s) => (
              <li key={s}>
                {SECTIONS.find((x) => x.key === s)!.label}
                {s === "log" ? ` · ${handovers.length} handovers` : ""}
              </li>
            ))}
            {format === "pdf" && photos && sections.includes("log") && (
              <li>Weigh-in photos · {photoCount}</li>
            )}
          </ul>
          {format === "pdf" &&
            photos &&
            sections.includes("log") &&
            photoCount > 10 && (
              <p className="text-xs text-muted">
                Reports with photos may take a moment to load before printing.
              </p>
            )}
        </aside>
      </div>
      <SheetActions>
        <Button
          variant="secondary"
          size="md"
          className="px-[18px]"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          size="md"
          className="px-[18px]"
          disabled={sections.length === 0}
          onClick={download}
        >
          {format === "pdf"
            ? "Open printable report"
            : `Download ${sections.length} CSV file${sections.length === 1 ? "" : "s"}`}
        </Button>
      </SheetActions>
    </Sheet>
  );
}

/** One CSV per section from the data already loaded. */
function csvFor(
  sections: SectionKey[],
  d: ReportData,
  a: AnalyticsReport,
  handovers: Handover[],
): CsvTable[] {
  const out: CsvTable[] = [];
  for (const s of sections) {
    if (s === "overview")
      out.push({
        filename: "overview-kpis.csv",
        header: ["KPI", "This period", "Previous period"],
        rows: Object.entries(a.kpis).map(([k, v]) => [k, v.value, v.previous]),
      });
    if (s === "impact")
      out.push(
        {
          filename: "impact-daily-kg.csv",
          header: ["Day", "kg"],
          rows: d.daily.map((r) => [r.day, r.kg]),
        },
        {
          filename: "impact-by-category.csv",
          header: ["Category", "kg"],
          rows: a.byGroup.map((g) => [GROUP_LABEL[g.group] ?? g.group, g.kg]),
        },
      );
    if (s === "supply")
      out.push({
        filename: "supply-batches.csv",
        header: [
          "Batch",
          "Harvest date",
          "Total kg",
          "Top-ups kg",
          "School reserve kg",
          "Bulk collected kg",
          "Individual collected kg",
          "Unclaimed kg",
          "% distributed",
          "Status",
        ],
        rows: d.batches.map((b) => [
          b.reference,
          b.harvestDate.slice(0, 10),
          b.totalKg,
          b.topUpKg,
          b.schoolReserveKg,
          b.bulkKg,
          b.individualKg,
          b.unclaimedKg,
          b.distributedPct,
          b.status,
        ]),
      });
    if (s === "funnel")
      out.push({
        filename: "claims-funnel.csv",
        header: ["Metric", "Value"],
        rows: [
          ["Submitted", d.funnel.submitted.count],
          ["Approved", d.funnel.approved.count],
          ["Booked", d.funnel.booked.count],
          ["Collected", d.funnel.collected.count],
          ["Avg hours to decide", d.responseTime.avgHours],
          ...Object.entries(d.rejectionReasons).map(
            ([k, v]) =>
              [
                `Rejected: ${REJECTION_REASON_MANAGER_LABEL[k as keyof typeof REJECTION_REASON_MANAGER_LABEL] ?? k}`,
                v,
              ] as [string, number],
          ),
          ...Object.entries(d.cancellationReasons).map(
            ([k, v]) =>
              [
                `Cancelled: ${CANCELLATION_REASON_LABEL[k as keyof typeof CANCELLATION_REASON_LABEL] ?? k}`,
                v,
              ] as [string, number],
          ),
        ],
      });
    if (s === "pickups")
      out.push({
        filename: "pickups-utilisation.csv",
        header: ["Weekday (0=Mon)", "Time", "Slots", "Booked", "Capacity"],
        rows: d.pickups.heatmap.map((c) => [
          c.weekday,
          bandLabel(c.band),
          c.slots,
          c.booked,
          c.capacity,
        ]),
      });
    if (s === "takers")
      out.push({
        filename: "takers-bulk-partners.csv",
        header: [
          "Organisation",
          "Target kg",
          "Collected kg",
          "Previous period kg",
        ],
        rows: d.takers.bulkPartners.map((b) => [
          b.name,
          b.target,
          b.collected,
          b.previousCollected,
        ]),
      });
    if (s === "log") out.push(logCsv(handovers));
  }
  return out;
}
