"use client";

import { BookmarkSimple } from "@phosphor-icons/react/dist/ssr/BookmarkSimple";
import { Trash } from "@phosphor-icons/react/dist/ssr/Trash";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import { useState } from "react";
import { FormErrorBanner } from "@/components/auth/auth-layout";
import { SheetActions } from "@/components/manager/batch-detail/batch-sheets";
import { RangePicker } from "@/components/manager/dashboard/widgets-top";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/labels";
import type { Batch, SavedView } from "@/lib/types";
import type { RangePreset } from "@/lib/use-load";
import { GROUP_LABEL, periodText, type ReportFilters } from "./report-model";

const RANGE_OPTIONS: { key: RangePreset; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "3months", label: "Last 3 months" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

const selectClass =
  "h-9 cursor-pointer rounded-[9px] border-none bg-surface pl-2.5 pr-7 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--color-edge)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-leaf)]";

/**
 * Reports global filter bar (sticky): date range, compare, batch, taker type, category,
 * saved views; then the active filters as removable chips (board "Reports · filter chip").
 */
export function ReportFilterBar({
  filters,
  onChange,
  defaults,
  batches,
  views,
  now,
  onSaveView,
  onDeleteView,
}: {
  filters: ReportFilters;
  onChange: (f: ReportFilters) => void;
  defaults: ReportFilters;
  batches: Batch[];
  views: SavedView[];
  now: number;
  onSaveView: (name: string) => Promise<void>;
  onDeleteView: (id: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [viewId, setViewId] = useState("");
  const set = (patch: Partial<ReportFilters>) =>
    onChange({ ...filters, ...patch });
  const batchRef = batches.find((b) => b.id === filters.batchId)?.reference;

  const chips = [
    {
      key: "range",
      label: periodText(filters, now),
      remove: () => set({ range: defaults.range, custom: defaults.custom }),
    },
    ...(filters.compare && filters.range !== "all"
      ? [
          {
            key: "compare",
            label: "Compared to previous period",
            remove: () => set({ compare: false }),
          },
        ]
      : []),
    ...(filters.batchId
      ? [
          {
            key: "batch",
            label: `Batch: ${batchRef ?? "…"}`,
            remove: () => set({ batchId: "" }),
          },
        ]
      : []),
    ...(filters.takerType
      ? [
          {
            key: "type",
            label: `Taker type: ${filters.takerType === "BULK" ? "Bulk" : "Individual"}`,
            remove: () => set({ takerType: "" }),
          },
        ]
      : []),
    ...(filters.category
      ? [
          {
            key: "cat",
            label: `Category: ${GROUP_LABEL[filters.category] ?? filters.category}`,
            remove: () => set({ category: "" }),
          },
        ]
      : []),
  ];

  return (
    <div
      aria-label="Filters"
      className="sticky top-[72px] z-20 -mx-4 flex flex-col gap-3 bg-beige/95 px-4 py-3 shadow-[0_1px_0_rgba(var(--rgb-hair),0.14)] backdrop-blur-sm md:-mx-8 md:px-8 print:hidden"
    >
      <div className="flex flex-wrap items-end gap-3">
        <RangePicker
          value={filters.range}
          onChange={(r) => set({ range: r })}
          custom={filters.custom}
          onCustom={(c) => set({ custom: c })}
          options={RANGE_OPTIONS}
        />
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 text-[13px] font-semibold">
          <input
            type="checkbox"
            checked={filters.compare}
            disabled={filters.range === "all"}
            onChange={(e) => set({ compare: e.target.checked })}
            className="size-4 accent-[var(--color-leaf)]"
          />
          Compare to previous period
        </label>
        <select
          aria-label="Batch"
          value={filters.batchId}
          onChange={(e) => set({ batchId: e.target.value })}
          className={selectClass}
        >
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.reference}
            </option>
          ))}
        </select>
        <select
          aria-label="Taker type"
          value={filters.takerType}
          onChange={(e) =>
            set({
              takerType: e.target.value as ReportFilters["takerType"],
              category: e.target.value === "INDIVIDUAL" ? "" : filters.category,
            })
          }
          className={selectClass}
        >
          <option value="">All takers</option>
          <option value="INDIVIDUAL">Individuals</option>
          <option value="BULK">Bulk</option>
        </select>
        <select
          aria-label="Category"
          value={filters.category}
          disabled={filters.takerType === "INDIVIDUAL"}
          onChange={(e) =>
            set({
              category: e.target.value,
              takerType: e.target.value ? "BULK" : filters.takerType,
            })
          }
          className={selectClass}
        >
          <option value="">All categories</option>
          {Object.entries(GROUP_LABEL)
            .filter(([k]) => k !== "INDIVIDUAL")
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </select>
        <select
          aria-label="Saved view"
          value={viewId}
          onChange={(e) => {
            setViewId(e.target.value);
            const v = views.find((x) => x.id === e.target.value);
            if (v)
              onChange({
                ...defaults,
                ...(v.filters as Partial<ReportFilters>),
              });
          }}
          className={selectClass}
        >
          <option value="">
            {views.length ? "Choose a view…" : "No saved views"}
          </option>
          {views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        {viewId && (
          <button
            type="button"
            aria-label="Delete this saved view"
            onClick={() => void onDeleteView(viewId).then(() => setViewId(""))}
            className="flex size-9 items-center justify-center rounded-[9px] text-error hover:bg-danger-tint"
          >
            <Trash size={16} />
          </button>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="h-9 px-3 text-[13px]"
          icon={<BookmarkSimple size={16} />}
          onClick={() => setSaving(true)}
        >
          Save view
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-bold text-muted">Active:</span>
        {chips.map((c) => (
          <span
            key={c.key}
            className="inline-flex h-7 items-center gap-1 rounded-full bg-sage pl-3 pr-1 font-semibold text-deep"
          >
            {c.label}
            <button
              type="button"
              aria-label={`Remove ${c.label}`}
              onClick={c.remove}
              className="flex size-5 items-center justify-center rounded-full hover:bg-cream"
            >
              <X size={12} weight="bold" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => onChange(defaults)}
          className={cn(
            "ml-1 font-bold text-deep underline",
            chips.length <= 2 && !filters.batchId && "opacity-70",
          )}
        >
          Reset filters
        </button>
      </div>
      {saving && (
        <SaveViewSheet
          summary={chips.map((c) => c.label).join(" · ")}
          onClose={() => setSaving(false)}
          onSave={onSaveView}
        />
      )}
    </div>
  );
}

/** Board "Reports · save view". */
function SaveViewSheet({
  summary,
  onClose,
  onSave,
}: {
  summary: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet labelledBy="save-view-title" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          onSave(name.trim()).then(onClose, (err) => {
            setBusy(false);
            setError(friendlyError(err));
          });
        }}
      >
        <h3
          id="save-view-title"
          className="font-display m-0 text-[22px] font-semibold text-deep"
        >
          Save this view
        </h3>
        {error && <FormErrorBanner>{error}</FormErrorBanner>}
        <Field
          id="view-name"
          label="View name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Monthly SUSS report"
          maxLength={80}
          required
          autoFocus
        />
        <p className="text-[13px] text-muted">Saves: {summary}</p>
        <SheetActions>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="px-[18px]"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="md"
            className="px-[18px]"
            loading={busy}
            disabled={!name.trim()}
          >
            Save view
          </Button>
        </SheetActions>
      </form>
    </Sheet>
  );
}
