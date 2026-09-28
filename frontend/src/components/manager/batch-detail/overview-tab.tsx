"use client";

import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { ClipboardText } from "@phosphor-icons/react/dist/ssr/ClipboardText";
import { Handshake } from "@phosphor-icons/react/dist/ssr/Handshake";
import { Leaf } from "@phosphor-icons/react/dist/ssr/Leaf";
import { LockSimple } from "@phosphor-icons/react/dist/ssr/LockSimple";
import { PencilSimple } from "@phosphor-icons/react/dist/ssr/PencilSimple";
import { PlusCircle } from "@phosphor-icons/react/dist/ssr/PlusCircle";
import { Truck } from "@phosphor-icons/react/dist/ssr/Truck";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import { useState, type FormEvent, type ReactNode } from "react";
import { FormErrorBanner } from "@/components/auth/auth-layout";
import {
  Chip,
  DataTable,
  Panel,
  rowClass,
  tdClass,
} from "@/components/manager/panel";
import { Button } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";
import { api } from "@/lib/api";
import {
  batchPayload,
  validateBatchForm,
  type BatchFormValues,
} from "@/lib/batch-form";
import {
  firstName,
  formatClock,
  formatDayMonth,
  formatFullDate,
  formatKg,
  sgDayKey,
} from "@/lib/format";
import { friendlyError } from "@/lib/labels";
import type { Allocation, BatchDetail, Claim, Handover } from "@/lib/types";

/** Overview tab: batch info (editable while Draft) | top-up history + activity log. */
export function OverviewTab({
  batch,
  activity,
  now,
  onSaved,
}: {
  batch: BatchDetail;
  activity: ActivityItem[];
  now: number;
  onSaved: (message: string) => void;
}) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      {batch.status === "DRAFT" ? (
        <DraftInfoForm key={batch.id} batch={batch} onSaved={onSaved} />
      ) : (
        <BatchInfo batch={batch} />
      )}
      <div className="flex min-w-0 flex-col gap-4">
        <Panel title="Top-up history">
          {batch.topUps && batch.topUps.length > 0 ? (
            <DataTable head={["Date", "kg added", "Note", "By"]}>
              {batch.topUps.map((t) => (
                <tr key={t.id} className={rowClass}>
                  <td className={`${tdClass} whitespace-nowrap`}>
                    {formatDayMonth(t.createdAt)}
                  </td>
                  <td className={tdClass}>
                    <strong className="text-leaf">+{formatKg(t.kg)}kg</strong>
                  </td>
                  <td className={tdClass}>{t.note ?? "—"}</td>
                  <td className={`${tdClass} text-muted`}>
                    {shortName(t.createdBy.name)}
                  </td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <p className="text-small text-muted">No top-ups yet.</p>
          )}
        </Panel>
        <Panel title="Activity log">
          <ol className="m-0 flex list-none flex-col p-0">
            {activity.map((a) => (
              <li
                key={a.key}
                className="flex items-center gap-3 py-2.5 shadow-[inset_0_-1px_0_rgba(var(--rgb-hair),0.14)]"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sage text-deep">
                  {a.icon}
                </span>
                <span className="grow text-small">{a.text}</span>
                <span className="whitespace-nowrap text-xs text-muted">
                  {formatWhen(a.at, now)}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}

function BatchInfo({ batch }: { batch: BatchDetail }) {
  const topUpKg = (batch.topUps ?? []).reduce((sum, t) => sum + t.kg, 0);
  const total = batch.pool.totalKg;
  const rows: [string, ReactNode][] = [
    ["Reference", batch.reference],
    ["Harvest date", formatFullDate(batch.harvestDate)],
    [
      "Total kg",
      <>
        {formatKg(total)}kg{" "}
        {topUpKg > 0 && (
          <span className="font-normal text-muted">
            ({formatKg(total - topUpKg)}kg harvested + {formatKg(topUpKg)}kg
            top-up)
          </span>
        )}
      </>,
    ],
    ["School reserve", `${formatKg(batch.pool.schoolReserveKg)}kg`],
    ["pH reading", batch.phReading ?? "—"],
    ["Claim window", claimWindowLong(batch)],
    ["Pickup location", batch.pickupLocation ?? "—"],
    ["Notes", batch.notes ?? "—"],
  ];
  return (
    <Panel
      title="Batch info"
      actions={
        <Chip
          tone="grey"
          icon={<LockSimple size={14} weight="bold" aria-hidden />}
        >
          Locked after publishing
        </Chip>
      }
    >
      <dl className="m-0 grid grid-cols-[minmax(110px,170px)_minmax(0,1fr)] text-small">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="py-[11px] text-muted shadow-[inset_0_-1px_0_rgba(var(--rgb-hair),0.14)]">
              {k}
            </dt>
            <dd className="m-0 py-[11px] font-semibold shadow-[inset_0_-1px_0_rgba(var(--rgb-hair),0.14)]">
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/** Board "Batch detail · draft": the info card becomes a form. PATCH /batches/:id. */
function DraftInfoForm({
  batch,
  onSaved,
}: {
  batch: BatchDetail;
  onSaved: (message: string) => void;
}) {
  const initial: BatchFormValues = {
    harvest: sgDayKey(batch.harvestDate),
    total: String(batch.pool.totalKg),
    reserve: String(batch.pool.schoolReserveKg),
    ph: batch.phReading == null ? "" : String(batch.phReading),
    from: batch.availableFrom ? sgDayKey(batch.availableFrom) : "",
    until: batch.availableUntil ? sgDayKey(batch.availableUntil) : "",
    location: batch.pickupLocation ?? "",
    notes: batch.notes ?? "",
  };
  const [v, setV] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = validateBatchForm(v);
  const shown = attempted ? errors : {};
  const dirty = (Object.keys(v) as (keyof BatchFormValues)[]).some(
    (k) => v[k] !== initial[k],
  );
  const set =
    (k: keyof BatchFormValues) => (e: { target: { value: string } }) =>
      setV((prev) => ({ ...prev, [k]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setError(null);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    try {
      await api.patch(`/batches/${batch.id}`, batchPayload(v));
      setSaving(false);
      onSaved("Draft saved.");
    } catch (err) {
      setSaving(false);
      setError(friendlyError(err));
    }
  }

  return (
    <Panel
      title="Batch info"
      titleId="batch-info-title"
      actions={
        <Chip icon={<PencilSimple size={14} weight="bold" aria-hidden />}>
          Editable while Draft
        </Chip>
      }
    >
      <form noValidate onSubmit={save} className="flex flex-col gap-4">
        {error && <FormErrorBanner>{error}</FormErrorBanner>}
        {attempted && Object.keys(errors).length > 0 && (
          <FormErrorBanner>
            {Object.keys(errors).length === 1
              ? "1 thing to fix before saving"
              : `${Object.keys(errors).length} things to fix before saving`}
          </FormErrorBanner>
        )}
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field
            id="e-ref"
            label="Reference"
            value={batch.reference}
            disabled
            helperText="Set when the batch was logged"
          />
          <Field
            id="e-harvest"
            label="Harvest date"
            type="date"
            value={v.harvest}
            onChange={set("harvest")}
            errorText={shown.harvest}
            required
          />
          <Field
            id="e-total"
            label="Total kg"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            value={v.total}
            onChange={set("total")}
            errorText={shown.total}
            required
          />
          <Field
            id="e-reserve"
            label="School reserve kg"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            value={v.reserve}
            onChange={set("reserve")}
            helperText="Set aside for the SUSS rooftop garden"
            errorText={shown.reserve}
            required
          />
          <Field
            id="e-ph"
            label="pH reading (optional)"
            type="number"
            inputMode="decimal"
            min={0}
            max={14}
            step="0.1"
            value={v.ph}
            onChange={set("ph")}
            errorText={shown.ph}
          />
          <Field
            id="e-loc"
            label="Pickup location"
            value={v.location}
            onChange={set("location")}
            maxLength={200}
          />
          <Field
            id="e-from"
            label="Available from"
            type="date"
            value={v.from}
            onChange={set("from")}
            errorText={shown.from}
            required
          />
          <Field
            id="e-until"
            label="Until"
            type="date"
            value={v.until}
            onChange={set("until")}
            errorText={shown.until}
            required
          />
        </div>
        <TextAreaField
          id="e-notes"
          label="Notes (optional)"
          rows={3}
          value={v.notes}
          onChange={set("notes")}
          maxLength={2000}
        />
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="px-5"
            disabled={!dirty || saving}
            onClick={() => {
              setV(initial);
              setAttempted(false);
              setError(null);
            }}
          >
            Discard changes
          </Button>
          <Button type="submit" size="md" loading={saving} disabled={!dirty}>
            Save draft
          </Button>
        </div>
      </form>
    </Panel>
  );
}

// ─── Activity log ─────────────────────────────────────────────────────────────

export interface ActivityItem {
  key: string;
  at: string;
  icon: ReactNode;
  text: string;
}

/**
 * The backend's ActivityLog table isn't written to yet, so the feed is built from the
 * timestamps the batch's records already carry: logged, top-ups, claims (submitted /
 * decided / cancelled), allocations and handovers. Newest first, capped at `limit`.
 * (Publishing has no timestamp of its own, so it doesn't appear.)
 */
export function deriveActivity(
  input: {
    batch: BatchDetail;
    claims: Claim[] | null;
    allocations: Allocation[] | null;
    handovers: Handover[] | null;
  },
  limit = 8,
): ActivityItem[] {
  const { batch } = input;
  const items: ActivityItem[] = [];
  const by = batch.createdBy ? ` by ${firstName(batch.createdBy.name)}` : "";
  items.push({
    key: "logged",
    at: batch.createdAt,
    icon: <Leaf size={16} />,
    text: `Batch logged as draft${by}`,
  });

  for (const t of batch.topUps ?? []) {
    items.push({
      key: `t-${t.id}`,
      at: t.createdAt,
      icon: <PlusCircle size={16} />,
      text: `${firstName(t.createdBy.name)} topped up ${formatKg(t.kg)}kg${t.note ? ` · ${t.note}` : ""}`,
    });
  }
  for (const c of input.claims ?? []) {
    const who = c.taker ? firstName(c.taker.name) : "A taker";
    items.push({
      key: `c-${c.id}`,
      at: c.submittedAt,
      icon: <ClipboardText size={16} />,
      text: `${who} claimed ${formatKg(Number(c.requestedKg))}kg · ${c.reference}`,
    });
    if (
      c.decidedAt &&
      (c.status === "APPROVED" ||
        c.status === "COLLECTED" ||
        c.approvedKg != null)
    ) {
      items.push({
        key: `ca-${c.id}`,
        at: c.decidedAt,
        icon: <Check size={16} />,
        text: `Approved ${c.reference} · ${formatKg(Number(c.approvedKg ?? c.requestedKg))}kg`,
      });
    } else if (c.decidedAt && c.status === "REJECTED") {
      items.push({
        key: `cr-${c.id}`,
        at: c.decidedAt,
        icon: <X size={16} />,
        text: `Rejected ${c.reference}`,
      });
    }
    if (c.cancelledAt) {
      items.push({
        key: `cc-${c.id}`,
        at: c.cancelledAt,
        icon: <X size={16} />,
        text: `${c.reference} cancelled`,
      });
    }
  }
  for (const a of input.allocations ?? []) {
    items.push({
      key: `a-${a.id}`,
      at: a.createdAt,
      icon: <Truck size={16} />,
      text: `Allocation added: ${a.taker.name} · ${formatKg(Number(a.allocatedKg))}kg`,
    });
  }
  for (const h of input.handovers ?? []) {
    items.push({
      key: `h-${h.id}`,
      at: h.handedOverAt,
      icon: <Handshake size={16} />,
      text: `Handover recorded: ${formatKg(h.actualKg)}kg${h.taker ? ` to ${h.taker.name}` : ""}`,
    });
  }
  return items.sort((x, y) => y.at.localeCompare(x.at)).slice(0, limit);
}

/** "Just now", "40m ago", "2h ago", "Yesterday, 2:20pm", "27 Sep". */
function formatWhen(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  const today = sgDayKey(new Date(now).toISOString());
  const day = sgDayKey(iso);
  if (day === today) {
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }
  const yesterday = sgDayKey(new Date(now - 86_400_000).toISOString());
  if (day === yesterday) return `Yesterday, ${formatClock(iso)}`;
  return formatDayMonth(iso);
}

/** "Calvin Lim" → "Calvin L." (design's top-up "By" column). */
function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
}

function claimWindowLong(b: BatchDetail): string {
  if (!b.availableFrom && !b.availableUntil) return "—";
  const a = b.availableFrom ? formatDayMonth(b.availableFrom) : "Now";
  const z = b.availableUntil ? formatFullDate(b.availableUntil) : "open-ended";
  return `${a} – ${z}`;
}
