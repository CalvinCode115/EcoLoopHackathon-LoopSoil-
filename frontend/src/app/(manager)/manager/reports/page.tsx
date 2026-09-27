"use client";

import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { DownloadSimple } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import { FileArrowDown } from "@phosphor-icons/react/dist/ssr/FileArrowDown";
import { Handshake } from "@phosphor-icons/react/dist/ssr/Handshake";
import { useState } from "react";
import { EmptyPot, Sprout } from "@/components/brand/illustrations";
import {
  DownloadDialog,
  SECTIONS,
  type SectionKey,
} from "@/components/reports/download-dialog";
import { HandoverLog, logCsv } from "@/components/reports/handover-log";
import { ReportFilterBar } from "@/components/reports/report-filters";
import {
  buildInsights,
  compareLabel,
  defaultFilters,
  downloadCsv,
  periodText,
  type ReportFilters,
} from "@/components/reports/report-model";
import {
  FunnelSection,
  PickupsSection,
  TakersSection,
} from "@/components/reports/sections-activity";
import {
  ImpactSection,
  OverviewSection,
  SupplySection,
} from "@/components/reports/sections-impact";
import { useReport } from "@/components/reports/use-report";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast } from "@/components/ui/toast";
import { api, type Paginated } from "@/lib/api";
import { formatClock, sgDayKey } from "@/lib/format";
import { friendlyError } from "@/lib/labels";
import type { Batch, Claim, SavedView, TakerRecord } from "@/lib/types";
import { rangeBounds, useLoad } from "@/lib/use-load";

/**
 * Manager · Reports (/manager/reports) — boards "Reports · full / ready / loading / empty /
 * first run / filter chip / save view / chart menu / table view / chart error / lightbox /
 * log drawer / export / download / generating / print". The Waste Diary and compost
 * analytics: global filters, seven sections, per-chart CSV + table view, the handover log,
 * CSV exports and a printable (Save as PDF) report.
 */
export default function ManagerReportsPage() {
  const [now, setNow] = useState(() => Date.now());
  const [today] = useState(() => sgDayKey(new Date().toISOString()));
  const defaults = defaultFilters(today);
  const [filters, setFilters] = useState<ReportFilters>(defaults);
  const [refresh, setRefresh] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const report = useReport(filters, now, refresh);
  const batches = useLoad(`rep-batches-${refresh}`, () =>
    api.get<Paginated<Batch>>("/batches?pageSize=100").then((p) => p.data),
  );
  const views = useLoad(`views-${refresh}`, () =>
    api.get<SavedView[]>("/reporting/views"),
  );

  const compare =
    filters.compare && filters.range !== "all" ? compareLabel(filters) : "";
  const bounds = rangeBounds(filters.range, now, filters.custom);
  const monthLabel = new Date(bounds.to).toLocaleDateString("en-SG", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Singapore",
  });

  async function exportData(
    kind: "handovers" | "claims" | "batches" | "takers",
  ) {
    try {
      if (kind === "handovers" && report.status === "ready")
        downloadCsv(logCsv(report.data.handovers));
      if (kind === "batches" && report.status === "ready")
        downloadCsv({
          filename: "batches.csv",
          header: [
            "Batch",
            "Harvest date",
            "Status",
            "Total kg",
            "Top-ups kg",
            "Collected kg",
            "% distributed",
          ],
          rows: report.data.data.batches.map((b) => [
            b.reference,
            b.harvestDate.slice(0, 10),
            b.status,
            b.totalKg,
            b.topUpKg,
            b.collectedKg,
            b.distributedPct,
          ]),
        });
      if (kind === "claims") {
        const p = await api.get<Paginated<Claim>>("/claims?pageSize=100");
        downloadCsv({
          filename: "claims.csv",
          header: [
            "Reference",
            "Taker",
            "Batch",
            "Requested kg",
            "Approved kg",
            "Status",
            "Submitted",
            "Decided",
          ],
          rows: p.data.map((c) => [
            c.reference,
            c.taker?.name ?? "",
            c.batch?.reference ?? "",
            c.requestedKg,
            c.approvedKg,
            c.status,
            c.submittedAt,
            c.decidedAt,
          ]),
        });
      }
      if (kind === "takers") {
        const p = await api.get<Paginated<TakerRecord>>("/takers?pageSize=100");
        downloadCsv({
          filename: "takers.csv",
          header: [
            "Name",
            "Type",
            "Category",
            "Status",
            "Monthly target kg",
            "Joined",
          ],
          rows: p.data.map((t) => [
            t.name,
            t.type,
            t.category,
            t.status,
            t.monthlyKgTarget,
            t.createdAt ?? "",
          ]),
        });
      }
    } catch (err) {
      setToast({ tone: "error", text: friendlyError(err) });
    }
  }

  function printHref(opts: {
    sections: SectionKey[];
    photos: boolean;
    title: string;
    logos: boolean;
  }) {
    const q = new URLSearchParams({
      f: JSON.stringify(filters),
      s: opts.sections.join(","),
      photos: opts.photos ? "1" : "0",
      logos: opts.logos ? "1" : "0",
      title: opts.title,
    });
    return `/manager/reports/print?${q}`;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display m-0 text-[32px] font-semibold leading-10 text-deep">
            Reports
          </h1>
          <p className="flex items-center gap-2 text-[15px] text-muted">
            Waste Diary and compost analytics · Last updated{" "}
            {formatClock(new Date(now).toISOString())}
            <button
              type="button"
              aria-label="Refresh"
              onClick={() => {
                setNow(Date.now());
                setRefresh((n) => n + 1);
              }}
              className="flex size-9 items-center justify-center rounded-full text-deep hover:bg-sage"
            >
              <ArrowClockwise size={18} weight="bold" />
            </button>
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1 rounded-control shadow-[inset_0_0_0_1.5px_var(--color-leaf)]">
            <span className="flex items-center gap-1.5 pl-3.5 text-small font-bold text-deep">
              <DownloadSimple size={18} aria-hidden />
              Export data
            </span>
            <ActionMenu
              label="Export data"
              items={[
                {
                  label: "Handovers CSV",
                  onSelect: () => void exportData("handovers"),
                },
                {
                  label: "Claims CSV",
                  onSelect: () => void exportData("claims"),
                },
                {
                  label: "Batches CSV",
                  onSelect: () => void exportData("batches"),
                },
                {
                  label: "Takers CSV",
                  onSelect: () => void exportData("takers"),
                },
              ]}
            />
          </div>
          <Button
            size="sm"
            className="px-[18px]"
            icon={<FileArrowDown size={18} />}
            disabled={report.status !== "ready"}
            onClick={() => setDownloading(true)}
          >
            Download report
          </Button>
        </div>
      </div>

      <ReportFilterBar
        filters={filters}
        onChange={setFilters}
        defaults={defaults}
        batches={batches.status === "ready" ? batches.data : []}
        views={views.status === "ready" ? views.data : []}
        now={now}
        onSaveView={async (name) => {
          await api.post("/reporting/views", { name, filters });
          setToast({ tone: "success", text: `View saved · ${name}` });
          views.reload();
        }}
        onDeleteView={async (id) => {
          await api.del(`/reporting/views/${id}`);
          setToast({ tone: "success", text: "Saved view deleted" });
          views.reload();
        }}
      />

      <nav
        aria-label="Report sections"
        className="-mx-1 flex gap-1 overflow-x-auto"
      >
        {SECTIONS.map((s) => (
          <a
            key={s.key}
            href={`#${s.key}`}
            className="whitespace-nowrap rounded-full px-3.5 py-2 text-small font-semibold text-deep no-underline hover:bg-sage"
          >
            {s.label}
          </a>
        ))}
      </nav>

      {report.status === "loading" && <ReportSkeleton />}
      {report.status === "error" && (
        <div
          role="alert"
          className="flex flex-col items-center gap-2 rounded-card bg-cream p-10 text-center shadow-card"
        >
          <p className="font-semibold text-danger-ink">
            Couldn’t load this report
          </p>
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowClockwise size={16} weight="bold" />}
            onClick={report.reload}
          >
            Retry
          </Button>
        </div>
      )}
      {report.status === "ready" &&
        (report.data.data.allTime.pickups === 0 &&
        !filters.batchId &&
        !filters.takerType ? (
          <div className="flex flex-col items-center gap-3 rounded-card bg-cream px-6 py-14 text-center shadow-card">
            <span className="flex size-[140px] items-center justify-center rounded-full bg-sage">
              <Sprout width={96} />
            </span>
            <h2 className="font-display m-0 text-h3 font-semibold text-deep">
              Reports will appear after your first handover
            </h2>
            <p className="max-w-[420px] text-body text-muted">
              Once staff record a handover, your Waste Diary and charts fill in
              automatically.
            </p>
            <Button href="/manager/handover" icon={<Handshake size={18} />}>
              Go to Handover
            </Button>
          </div>
        ) : report.data.data.daily.length === 0 &&
          report.data.data.funnel.submitted.count === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card bg-cream px-6 py-14 text-center shadow-card">
            <EmptyPot width={140} />
            <h2 className="font-display m-0 text-h3 font-semibold text-deep">
              No data for this period
            </h2>
            <p className="text-body text-muted">
              Nothing was handed over or claimed in{" "}
              {periodText(filters, now).split(" · ")[1] ?? "this period"}.
            </p>
            <Button
              variant="secondary"
              onClick={() => setFilters({ ...filters, range: "all" })}
            >
              Try a wider date range
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            <OverviewSection
              data={report.data.data}
              analytics={report.data.analytics}
              compare={compare}
              insights={buildInsights(
                report.data.data,
                report.data.analytics.kpis.kgDiverted,
                compare || "vs previous period",
              )}
            />
            <ImpactSection
              data={report.data.data}
              byGroup={report.data.analytics.byGroup}
              compare={!!compare}
              onFilterGroup={(g) =>
                setFilters({
                  ...filters,
                  ...(g === "INDIVIDUAL"
                    ? { takerType: "INDIVIDUAL", category: "" }
                    : { takerType: "BULK", category: g }),
                })
              }
            />
            <SupplySection data={report.data.data} />
            <FunnelSection data={report.data.data} compare={compare} />
            <PickupsSection data={report.data.data} compare={compare} />
            <TakersSection data={report.data.data} />
            <HandoverLog rows={report.data.handovers} />
          </div>
        ))}

      {downloading && report.status === "ready" && (
        <DownloadDialog
          periodLabel={periodText(filters, now)}
          monthLabel={monthLabel}
          data={report.data.data}
          analytics={report.data.analytics}
          handovers={report.data.handovers}
          printHref={printHref}
          onClose={() => setDownloading(false)}
        />
      )}
      {toast && (
        <Toast
          tone={toast.tone}
          onDismiss={() => setToast(null)}
          duration={toast.tone === "success" ? 4000 : 0}
        >
          {toast.text}
        </Toast>
      )}
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <Skeleton className="h-[140px] w-full rounded-card" />
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-[120px] rounded-card" />
        ))}
      </div>
      <Skeleton className="h-[320px] w-full rounded-card" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[280px] rounded-card" />
        <Skeleton className="h-[280px] rounded-card" />
      </div>
    </div>
  );
}
