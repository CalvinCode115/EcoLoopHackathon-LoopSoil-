"use client";

import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import type { KeyboardEvent } from "react";
import { ClaimStatusBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatKg } from "@/lib/format";
import type { Claim } from "@/lib/types";
import { claimStatus, queueMeta } from "./claim-utils";

export interface ClaimFlag {
  label: string;
  /** amber = worth a look (no-shows); red = blocks approval (stock, unapproved taker). */
  tone: "amber" | "red";
}

/**
 * Claims queue (left half of the split view): one row per claim — name, flag, kg,
 * reference · batch, a status line and the badge. Pending rows get checkboxes for bulk
 * approve. ↑/↓ move through the list.
 */
export function ClaimQueue({
  claims,
  summary,
  selectedId,
  onSelect,
  selectable,
  checked,
  onToggle,
  onToggleAll,
  flags,
  now,
  bulkBar,
}: {
  claims: Claim[];
  summary: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectable: boolean;
  checked: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  flags: Map<string, ClaimFlag[]>;
  now: number;
  bulkBar?: {
    count: number;
    kg: number;
    onApprove: () => void;
    onClear: () => void;
  } | null;
}) {
  const allChecked =
    selectable && claims.length > 0 && claims.every((c) => checked.has(c.id));

  function onKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = claims.findIndex((c) => c.id === selectedId);
    const next =
      claims[
        Math.min(
          claims.length - 1,
          Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)),
        )
      ];
    if (next) {
      onSelect(next.id);
      document.getElementById(`claim-row-${next.id}`)?.focus();
    }
  }

  return (
    <section
      aria-label="Claims queue"
      className="flex min-w-0 flex-col self-stretch overflow-hidden rounded-card bg-cream shadow-card"
    >
      {bulkBar && bulkBar.count > 0 ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="flex items-center gap-3 bg-deep px-4 py-2.5 text-cream"
        >
          <BoxCheck checked onChange={onToggleAll} label="Clear selection" />
          <strong className="grow text-small">
            {bulkBar.count} selected · {formatKg(bulkBar.kg)}kg
          </strong>
          <button
            type="button"
            onClick={bulkBar.onApprove}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-leaf px-3.5 text-small font-bold text-cream hover:bg-[#5d8b46]"
          >
            <CheckCircle size={16} weight="bold" aria-hidden />
            Approve all
          </button>
          <button
            type="button"
            onClick={bulkBar.onClear}
            className="h-9 px-2 text-small font-bold text-cream underline"
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]">
          {selectable && claims.length > 0 && (
            <BoxCheck
              checked={allChecked}
              onChange={onToggleAll}
              label="Select all"
            />
          )}
          <span className="text-[13px] font-bold text-muted">{summary}</span>
        </div>
      )}

      <ul className="m-0 grow list-none p-0" onKeyDown={onKeyDown}>
        {claims.map((c) => {
          const current = c.id === selectedId;
          const meta = queueMeta(c, now);
          const rowFlags = flags.get(c.id) ?? [];
          return (
            <li key={c.id}>
              <div
                id={`claim-row-${c.id}`}
                role="button"
                tabIndex={0}
                aria-current={current ? "true" : undefined}
                onClick={() => onSelect(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(c.id);
                  }
                }}
                className={cn(
                  "relative flex cursor-pointer items-start gap-3 px-4 py-3.5 outline-none focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-leaf",
                  current
                    ? "bg-[#EEF3E6] shadow-[inset_0_-1px_0_rgba(107,107,94,0.14),inset_4px_0_0_var(--color-leaf)]"
                    : "shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)] hover:bg-row-hover",
                )}
              >
                {selectable && (
                  <span onClick={(e) => e.stopPropagation()}>
                    <BoxCheck
                      checked={checked.has(c.id)}
                      onChange={() => onToggle(c.id)}
                      label={`Select ${c.reference}`}
                    />
                  </span>
                )}
                <div className="flex min-w-0 grow flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <strong className="truncate text-[15px]">
                        {c.taker?.name ?? "Unknown taker"}
                      </strong>
                      {rowFlags.map((f) => (
                        <span
                          key={f.label}
                          title={f.label}
                          aria-label={f.label}
                          className={cn(
                            "inline-flex",
                            f.tone === "red"
                              ? "text-danger-ink"
                              : "text-amber-ink",
                          )}
                        >
                          <WarningCircle size={16} weight="fill" aria-hidden />
                        </span>
                      ))}
                    </span>
                    <strong className="whitespace-nowrap text-[15px] text-deep">
                      {formatKg(Number(c.approvedKg ?? c.requestedKg))}kg
                    </strong>
                  </div>
                  <span className="text-xs text-muted">
                    {c.reference} · {c.batch?.reference ?? "—"}
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "inline-flex h-6 min-w-0 items-center gap-1 truncate rounded-full px-2 text-xs font-bold",
                        meta.tone === "amber" && "bg-amber-tint text-amber-ink",
                        meta.tone === "red" && "bg-danger-tint text-danger-ink",
                        meta.tone === "grey" && "bg-[#ECE6D8] text-muted",
                      )}
                    >
                      <Clock
                        size={12}
                        weight="bold"
                        className="shrink-0"
                        aria-hidden
                      />
                      <span className="truncate">{meta.text}</span>
                    </span>
                    <ClaimStatusBadge status={claimStatus(c)} />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 22px square checkbox from the design (native input kept for keyboard + screen readers). */
function BoxCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="relative inline-flex size-6 shrink-0 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="peer absolute size-px opacity-0"
      />
      <span
        aria-hidden
        className={cn(
          "flex size-[22px] items-center justify-center rounded-md peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-leaf",
          checked
            ? "bg-leaf text-cream"
            : "bg-white shadow-[inset_0_0_0_1.5px_var(--color-edge)]",
        )}
      >
        {checked && <Check size={14} weight="bold" />}
      </span>
    </label>
  );
}
