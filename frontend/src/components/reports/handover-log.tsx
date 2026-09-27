"use client";

import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { Columns } from "@phosphor-icons/react/dist/ssr/Columns";
import { DownloadSimple } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import { Image as ImageIcon } from "@phosphor-icons/react/dist/ssr/Image";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  DataTable,
  Panel,
  rowClass,
  tdClass,
} from "@/components/manager/panel";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import {
  formatDayTime,
  formatFullDate,
  formatClock,
  formatKg,
  formatTimeRange,
  formatWeekdayDay,
} from "@/lib/format";
import type { Handover } from "@/lib/types";
import { SectionHead } from "./chart-card";
import { downloadCsv } from "./report-model";

const PAGE = 25;
const COLUMNS = [
  "Date & time",
  "Reference",
  "Taker",
  "Batch",
  "Approved",
  "Actual",
  "Bags",
  "Photo",
  "Recorded by",
] as const;
type Col = (typeof COLUMNS)[number];

export function bagsText(h: Handover): string {
  const parts = [
    h.halfKgBags > 0 && `½kg × ${h.halfKgBags}`,
    h.oneKgBags > 0 && `1kg × ${h.oneKgBags}`,
    h.looseKg > 0 && `loose ${formatKg(h.looseKg)}kg`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

export function logCsv(rows: Handover[]) {
  return {
    filename: "handover-log.csv",
    header: [
      "Date & time",
      "Reference",
      "Taker",
      "Taker type",
      "Batch",
      "Approved kg",
      "Actual kg",
      "Bags",
      "Photo",
      "Recorded by",
      "Note",
    ],
    rows: rows.map((h) => [
      new Date(h.handedOverAt).toISOString(),
      h.sourceReference ?? h.reference,
      h.taker?.name ?? "",
      h.taker?.type ?? "",
      h.batch?.reference ?? "",
      h.expectedKg ?? "",
      h.actualKg,
      bagsText(h),
      h.photoUrl ? "yes" : "no",
      h.handedOverBy?.name ?? "",
      h.note ?? "",
    ]),
  };
}

/**
 * Handover log (board "Reports · handover log", "lightbox", "log drawer"): the Waste Diary
 * record — every confirmed handover in the period. Search, pick columns, export, open a
 * row for the full record, open a photo full size.
 */
export function HandoverLog({
  rows,
  print,
}: {
  rows: Handover[];
  print?: boolean;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<Set<Col>>(new Set());
  const [colsOpen, setColsOpen] = useState(false);
  const [drawer, setDrawer] = useState<Handover | null>(null);
  const [photoIdx, setPhotoIdx] = useState<number | null>(null);

  const needle = q.trim().toLowerCase();
  const filtered = rows.filter(
    (h) =>
      !needle ||
      (h.taker?.name ?? "").toLowerCase().includes(needle) ||
      (h.sourceReference ?? h.reference).toLowerCase().includes(needle) ||
      (h.batch?.reference ?? "").toLowerCase().includes(needle),
  );
  const shown = print
    ? filtered
    : filtered.slice(page * PAGE, page * PAGE + PAGE);
  const withPhotos = filtered.filter((h) => h.photoUrl);
  const total = filtered.reduce((s, h) => s + h.actualKg, 0);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const vis = COLUMNS.filter(
    (c) => !hidden.has(c) && !(print && c === "Photo"),
  );

  return (
    <section className="flex flex-col gap-4">
      <SectionHead
        id="log"
        title="Handover log"
        description="The Waste Diary record · every confirmed handover"
      />
      <Panel
        title="Handovers"
        description={`${filtered.length} this period · ${formatKg(total)}kg`}
      >
        {!print && (
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex h-11 min-w-[220px] grow items-center gap-2 rounded-control bg-white px-3 shadow-[inset_0_0_0_1px_var(--color-edge)] focus-within:shadow-[inset_0_0_0_2px_var(--color-leaf)]">
              <MagnifyingGlass size={16} className="text-muted" aria-hidden />
              <input
                type="search"
                aria-label="Search takers"
                placeholder="Search taker, reference or batch"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                className="min-w-0 grow border-none bg-transparent text-small outline-none"
              />
            </div>
            <div className="relative">
              <button
                type="button"
                aria-expanded={colsOpen}
                onClick={() => setColsOpen((o) => !o)}
                className="inline-flex h-11 items-center gap-1.5 rounded-control px-3.5 text-small font-bold text-deep shadow-[inset_0_0_0_1.5px_var(--color-leaf)] hover:bg-sage"
              >
                <Columns size={16} aria-hidden />
                Columns
              </button>
              {colsOpen && (
                <div className="absolute right-0 top-12 z-30 flex w-[200px] flex-col gap-1 rounded-control bg-cream p-2 shadow-photo">
                  {COLUMNS.map((c) => (
                    <label
                      key={c}
                      className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-small hover:bg-sage"
                    >
                      <input
                        type="checkbox"
                        checked={!hidden.has(c)}
                        onChange={() =>
                          setHidden((h) => {
                            const n = new Set(h);
                            if (n.has(c)) n.delete(c);
                            else n.add(c);
                            return n;
                          })
                        }
                        className="accent-[var(--color-leaf)]"
                      />
                      {c}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => downloadCsv(logCsv(filtered))}
              className="inline-flex h-11 items-center gap-1.5 rounded-control px-3.5 text-small font-bold text-deep shadow-[inset_0_0_0_1.5px_var(--color-leaf)] hover:bg-sage"
            >
              <DownloadSimple size={16} aria-hidden />
              Export this table (CSV)
            </button>
          </div>
        )}
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-small text-muted">
            {needle
              ? `Nothing matches “${q.trim()}”.`
              : "No handovers in this period."}
          </p>
        ) : (
          <DataTable head={[...vis]}>
            {shown.map((h) => (
              <tr
                key={h.id}
                onClick={print ? undefined : () => setDrawer(h)}
                className={cn(rowClass, !print && "cursor-pointer")}
              >
                {vis.includes("Date & time") && (
                  <td className={`${tdClass} whitespace-nowrap`}>
                    {formatDayTime(h.handedOverAt)}
                  </td>
                )}
                {vis.includes("Reference") && (
                  <td className={`${tdClass} font-bold text-deep`}>
                    {h.sourceReference ?? h.reference}
                  </td>
                )}
                {vis.includes("Taker") && (
                  <td className={tdClass}>
                    <span className="block">{h.taker?.name ?? "—"}</span>
                    {h.taker?.type && (
                      <span className="text-xs text-muted">
                        {h.taker.type === "BULK" ? "Bulk" : "Individual"}
                      </span>
                    )}
                  </td>
                )}
                {vis.includes("Batch") && (
                  <td className={tdClass}>{h.batch?.reference ?? "—"}</td>
                )}
                {vis.includes("Approved") && (
                  <td className={tdClass}>
                    {h.expectedKg == null ? "—" : `${formatKg(h.expectedKg)}kg`}
                  </td>
                )}
                {vis.includes("Actual") && (
                  <td className={tdClass}>
                    <strong>{formatKg(h.actualKg)}kg</strong>
                    {h.expectedKg != null &&
                      Math.abs(h.actualKg - h.expectedKg) > 0.001 && (
                        <span
                          className={cn(
                            "block text-xs font-bold",
                            h.actualKg < h.expectedKg
                              ? "text-error"
                              : "text-amber-ink",
                          )}
                        >
                          {h.actualKg > h.expectedKg ? "+" : "−"}
                          {formatKg(Math.abs(h.actualKg - h.expectedKg))}kg
                        </span>
                      )}
                  </td>
                )}
                {vis.includes("Bags") && (
                  <td className={`${tdClass} text-xs`}>{bagsText(h)}</td>
                )}
                {vis.includes("Photo") && (
                  <td className={tdClass}>
                    {h.photoUrl ? (
                      <button
                        type="button"
                        aria-label="Open photo"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPhotoIdx(
                            withPhotos.findIndex((x) => x.id === h.id),
                          );
                        }}
                      >
                        <Image
                          src={h.photoUrl}
                          alt="Handover photo"
                          width={44}
                          height={44}
                          unoptimized
                          className="size-11 rounded-lg object-cover"
                        />
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <ImageIcon size={14} aria-hidden /> None
                      </span>
                    )}
                  </td>
                )}
                {vis.includes("Recorded by") && (
                  <td className={`${tdClass} text-muted`}>
                    {h.handedOverBy?.name ?? "—"}
                  </td>
                )}
              </tr>
            ))}
          </DataTable>
        )}
        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
            <strong>
              Total · {filtered.length} handover
              {filtered.length === 1 ? "" : "s"} · {formatKg(total)}kg
            </strong>
            {!print && pages > 1 && (
              <span className="flex items-center gap-2 text-muted">
                Showing {page * PAGE + 1}–
                {Math.min(filtered.length, page * PAGE + PAGE)} of{" "}
                {filtered.length}
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="flex size-9 items-center justify-center rounded-lg hover:bg-sage disabled:opacity-40"
                >
                  <CaretLeft size={16} weight="bold" />
                </button>
                {page + 1} / {pages}
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={page >= pages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="flex size-9 items-center justify-center rounded-lg hover:bg-sage disabled:opacity-40"
                >
                  <CaretRight size={16} weight="bold" />
                </button>
              </span>
            )}
          </div>
        )}
      </Panel>

      {drawer && (
        <LogDrawer
          h={drawer}
          onClose={() => setDrawer(null)}
          onPhoto={() =>
            setPhotoIdx(withPhotos.findIndex((x) => x.id === drawer.id))
          }
        />
      )}
      {photoIdx != null && photoIdx >= 0 && withPhotos[photoIdx] && (
        <Lightbox
          rows={withPhotos}
          index={photoIdx}
          onIndex={setPhotoIdx}
          onClose={() => setPhotoIdx(null)}
        />
      )}
    </section>
  );
}

function useEscape(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose]);
  return ref;
}

/** Board "Reports · log drawer": the full handover record. */
function LogDrawer({
  h,
  onClose,
  onPhoto,
}: {
  h: Handover;
  onClose: () => void;
  onPhoto: () => void;
}) {
  const ref = useEscape(onClose);
  const slot = h.booking?.slot;
  const rows: [string, React.ReactNode][] = [
    [
      "Date & time",
      `${formatFullDate(h.handedOverAt)}, ${formatClock(h.handedOverAt)}`,
    ],
    [
      "Reference",
      h.booking?.claim?.id ? (
        <Link
          href={`/manager/claims?claim=${h.booking.claim.id}`}
          className="font-bold text-deep"
        >
          {h.sourceReference} →
        </Link>
      ) : (
        (h.sourceReference ?? h.reference)
      ),
    ],
    ["Batch", h.batch?.reference ?? "—"],
    [
      "Slot",
      slot
        ? `${formatWeekdayDay(slot.startTime).replace(",", "")} · ${formatTimeRange(slot.startTime, slot.endTime)}`
        : "—",
    ],
    ["Approved", h.expectedKg == null ? "—" : `${formatKg(h.expectedKg)}kg`],
    ["Actual", `${formatKg(h.actualKg)}kg`],
    ["Bags", bagsText(h)],
    ["Note", h.note ?? "—"],
    [
      "Recorded by",
      `${h.handedOverBy?.name ?? "—"}${slot?.location ? ` · ${slot.location}` : ""}`,
    ],
  ];
  return (
    <div className="fixed inset-0 z-[55]">
      <div
        aria-hidden
        className="absolute inset-0 bg-[rgba(28,36,22,0.35)]"
        onClick={onClose}
      />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-drawer-title"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col gap-4 overflow-y-auto bg-cream p-6 shadow-photo outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
              Handover
            </span>
            <h2
              id="log-drawer-title"
              className="font-display m-0 text-[22px] font-semibold text-deep"
            >
              {formatKg(h.actualKg)}kg to {h.taker?.name ?? "—"}
            </h2>
            <span className="flex gap-2">
              {h.taker?.type && (
                <Badge
                  tone={h.taker.type === "BULK" ? "soil" : "sage"}
                  size="sm"
                >
                  {h.taker.type === "BULK" ? "Bulk" : "Individual"}
                </Badge>
              )}
              <Badge tone="deep" size="sm">
                Collected
              </Badge>
            </span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-control text-muted hover:bg-sage"
          >
            <X size={20} weight="bold" />
          </button>
        </div>
        {h.photoUrl ? (
          <div className="flex flex-col gap-2">
            <Image
              src={h.photoUrl}
              alt="Weigh-in photo"
              width={392}
              height={260}
              unoptimized
              className="h-[260px] w-full rounded-control object-cover"
            />
            <div className="flex gap-3 text-small font-bold">
              <button
                type="button"
                onClick={onPhoto}
                className="text-deep underline"
              >
                View full size
              </button>
              <a
                href={h.photoUrl}
                target="_blank"
                rel="noreferrer"
                download
                className="text-deep underline"
              >
                Download photo
              </a>
            </div>
          </div>
        ) : (
          <p className="rounded-control bg-amber-tint px-3.5 py-2.5 text-small text-amber-ink">
            No weigh-in photo on this record.
          </p>
        )}
        <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] text-small">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="py-2 text-muted shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]">
                {k}
              </dt>
              <dd className="m-0 py-2 font-semibold shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]">
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}

/** Board "Reports · lightbox": full-size photo with previous / next. */
function Lightbox({
  rows,
  index,
  onIndex,
  onClose,
}: {
  rows: Handover[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const ref = useEscape(onClose);
  const h = rows[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < rows.length - 1) onIndex(index + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, rows.length, onIndex]);
  const nav =
    "flex size-12 items-center justify-center rounded-full bg-black/40 text-cream hover:bg-black/60 disabled:opacity-30";
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Weigh-in photo"
      tabIndex={-1}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-[rgba(18,18,16,0.92)] p-6 outline-none"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 flex size-12 items-center justify-center rounded-full bg-black/40 text-cream hover:bg-black/60"
      >
        <X size={24} />
      </button>
      <div className="flex w-full items-center justify-center gap-4">
        <button
          type="button"
          aria-label="Previous photo"
          disabled={index === 0}
          onClick={() => onIndex(index - 1)}
          className={nav}
        >
          <CaretLeft size={24} />
        </button>
        <Image
          src={h.photoUrl!}
          alt={`Photo of the scale reading for ${h.sourceReference ?? h.reference}`}
          width={900}
          height={640}
          unoptimized
          className="max-h-[70vh] w-auto max-w-[80vw] rounded-control object-contain"
        />
        <button
          type="button"
          aria-label="Next photo"
          disabled={index >= rows.length - 1}
          onClick={() => onIndex(index + 1)}
          className={nav}
        >
          <CaretRight size={24} />
        </button>
      </div>
      <p className="text-center text-small text-cream">
        <strong>
          {h.sourceReference ?? h.reference} · {h.taker?.name} ·{" "}
          {formatKg(h.actualKg)}kg
        </strong>
        <br />
        <span className="text-cream/75">
          {formatFullDate(h.handedOverAt)}, {formatClock(h.handedOverAt)} ·
          Recorded by {h.handedOverBy?.name ?? "—"} · {index + 1} of{" "}
          {rows.length}
        </span>
      </p>
    </div>
  );
}
