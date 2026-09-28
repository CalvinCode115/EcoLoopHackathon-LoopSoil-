"use client";

import { Printer } from "@phosphor-icons/react/dist/ssr/Printer";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { LogoLockup } from "@/components/brand/logo";
import { HandoverLog } from "@/components/reports/handover-log";
import {
  buildInsights,
  compareLabel,
  defaultFilters,
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
import { Button } from "@/components/ui/button";
import { LoadingLabel } from "@/components/ui/skeleton";
import { formatDayTime, formatKg, sgDayKey } from "@/lib/format";

/**
 * Printable report (board "Reports · print") for "Download report → PDF": cover + the chosen
 * sections, laid out for A4. Opens the browser print dialog once everything (photos too)
 * has loaded — choose "Save as PDF" there.
 */
export default function ReportPrintPage() {
  return (
    <Suspense fallback={<LoadingLabel>Preparing your report…</LoadingLabel>}>
      <PrintReport />
    </Suspense>
  );
}

function PrintReport() {
  const params = useSearchParams();
  const [now] = useState(() => Date.now());
  const [filters] = useState<ReportFilters>(() => {
    const base = defaultFilters(sgDayKey(new Date().toISOString()));
    try {
      return {
        ...base,
        ...(JSON.parse(params.get("f") ?? "{}") as Partial<ReportFilters>),
      };
    } catch {
      return base;
    }
  });
  const sections = new Set((params.get("s") ?? "overview,log").split(","));
  const photos = params.get("photos") === "1";
  const logos = params.get("logos") !== "0";
  const title = params.get("title") ?? "LoopSoil report";
  const report = useReport(filters, now, 0);
  const printed = useRef(false);

  useEffect(() => {
    if (report.status !== "ready" || printed.current) return;
    printed.current = true;
    // Give charts and photos a moment to paint before the dialog opens.
    const imgs = Array.from(document.images).filter((i) => !i.complete);
    const go = () => setTimeout(() => window.print(), 400);
    if (!imgs.length) go();
    else
      Promise.all(
        imgs.map(
          (i) =>
            new Promise((r) => i.addEventListener("load", r, { once: true })),
        ),
      ).then(go);
  }, [report.status]);

  if (report.status === "loading")
    return <LoadingLabel>Preparing your report…</LoadingLabel>;
  if (report.status === "error")
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 p-10 text-center"
      >
        <p className="font-semibold text-danger-ink">
          Couldn’t create the report. Please try again.
        </p>
        <Button onClick={report.reload}>Try again</Button>
      </div>
    );

  const { data, analytics, handovers } = report.data;
  const compare =
    filters.compare && filters.range !== "all" ? compareLabel(filters) : "";
  const withPhotos = handovers.filter((h) => h.photoUrl);

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-8 bg-beige print:max-w-none print:bg-surface">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <p className="text-small text-muted">
          Your report is ready. In the print dialog choose “Save as PDF”.
        </p>
        <Button icon={<Printer size={18} />} onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
      </div>

      <section className="flex min-h-[70vh] flex-col justify-between gap-8 rounded-card bg-deep p-10 text-cream print:min-h-[260mm] print:break-after-page print:rounded-none">
        {logos && (
          // Fixed light chip: the navy SUSS logo needs it, even in dark mode.
          <div className="flex items-center gap-3 self-start rounded-control bg-[#FBF8F1] p-3">
            <LogoLockup />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <h1 className="font-display m-0 text-[40px] font-semibold leading-[48px]">
            {title}
          </h1>
          <p className="text-body text-cream/80">{periodText(filters, now)}</p>
        </div>
        <div>
          <div className="font-display text-[64px] font-semibold leading-[70px]">
            {formatKg(analytics.kpis.kgDiverted.value ?? 0)} kg
          </div>
          <p className="text-body text-cream/80">
            of food waste diverted into compost in this period
          </p>
          <p className="mt-2 text-small text-cream/70">
            Generated {formatDayTime(new Date(now).toISOString())}
          </p>
        </div>
      </section>

      {sections.has("overview") && (
        <OverviewSection
          data={data}
          analytics={analytics}
          compare={compare}
          insights={buildInsights(
            data,
            analytics.kpis.kgDiverted,
            compare || "vs previous period",
          )}
        />
      )}
      {sections.has("impact") && (
        <ImpactSection
          data={data}
          byGroup={analytics.byGroup}
          compare={!!compare}
          print
        />
      )}
      {sections.has("supply") && <SupplySection data={data} print />}
      {sections.has("funnel") && (
        <FunnelSection data={data} compare={compare} print />
      )}
      {sections.has("pickups") && (
        <PickupsSection data={data} compare={compare} print />
      )}
      {sections.has("takers") && <TakersSection data={data} print />}
      {sections.has("log") && <HandoverLog rows={handovers} print />}
      {sections.has("log") && photos && withPhotos.length > 0 && (
        <section className="flex flex-col gap-4 print:break-before-page">
          <h2 className="font-display m-0 text-2xl font-semibold text-deep">
            Weigh-in photos
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {withPhotos.map((h) => (
              <figure
                key={h.id}
                className="m-0 flex flex-col gap-1 break-inside-avoid"
              >
                <Image
                  src={h.photoUrl!}
                  alt={`Weigh-in photo for ${h.sourceReference ?? h.reference}`}
                  width={300}
                  height={220}
                  unoptimized
                  className="h-[180px] w-full rounded-control object-cover"
                />
                <figcaption className="text-xs">
                  <strong>{h.sourceReference ?? h.reference}</strong> ·{" "}
                  {h.taker?.name} · {formatKg(h.actualKg)}kg ·{" "}
                  {formatDayTime(h.handedOverAt)}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
