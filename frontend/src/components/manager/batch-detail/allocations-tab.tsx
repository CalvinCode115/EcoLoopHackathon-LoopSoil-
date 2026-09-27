"use client";

import { Plus } from "@phosphor-icons/react/dist/ssr/Plus";
import { Scales } from "@phosphor-icons/react/dist/ssr/Scales";
import { Truck } from "@phosphor-icons/react/dist/ssr/Truck";
import { useEffect, useState, type FormEvent } from "react";
import { FormErrorBanner } from "@/components/auth/auth-layout";
import { SheetActions } from "@/components/manager/batch-detail/batch-sheets";
import {
  Chip,
  DataTable,
  EmptyPanel,
  Panel,
  ProgressBar,
  rowClass,
  tdClass,
} from "@/components/manager/panel";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { api, type Paginated } from "@/lib/api";
import { formatKg } from "@/lib/format";
import {
  ALLOCATION_STATUS_LABEL,
  TAKER_CATEGORY_LABEL,
  friendlyError,
} from "@/lib/labels";
import type {
  Allocation,
  AllocationStatusValue,
  Batch,
  TakerCategoryValue,
  TakerRecord,
} from "@/lib/types";

const STATUS_TONE: Record<AllocationStatusValue, BadgeTone> = {
  PLANNED: "amber",
  CONFIRMED: "leaf",
  COLLECTED: "deep",
  CANCELLED: "grey",
};

type SheetState =
  | { kind: "add" }
  | { kind: "edit"; allocation: Allocation }
  | { kind: "cancel"; allocation: Allocation }
  | null;

/**
 * Allocations tab (boards "Batch detail · allocations / add allocation / over the pool"):
 * bulk takers' agreed kg from this batch, with each taker's monthly target vs what they've
 * been allocated this month. Data: GET /allocations?batchId=, POST /allocations,
 * PATCH /allocations/:id, POST /allocations/:id/confirm|cancel, GET /takers?type=BULK.
 */
export function AllocationsTab({
  batch,
  allocations,
  monthlyByTaker,
  onChanged,
  onError,
}: {
  batch: Batch;
  allocations: Allocation[];
  /** Taker id → kg allocated to them this month across every batch (not cancelled). */
  monthlyByTaker: Map<string, number>;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [sheet, setSheet] = useState<SheetState>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const canAdd = batch.status === "DRAFT" || batch.status === "OPEN";
  const unallocated = Math.max(0, batch.pool.kgRemaining);

  async function confirm(a: Allocation) {
    setConfirming(a.id);
    try {
      await api.post(`/allocations/${a.id}/confirm`);
      onChanged(
        `Allocation confirmed: ${a.taker.name} · ${formatKg(Number(a.allocatedKg))}kg`,
      );
    } catch (err) {
      onError(friendlyError(err));
    } finally {
      setConfirming(null);
    }
  }

  const addButton = canAdd && (
    <Button
      size="sm"
      className="px-[18px]"
      icon={<Plus size={18} weight="bold" />}
      onClick={() => setSheet({ kind: "add" })}
    >
      Add allocation
    </Button>
  );

  return (
    <>
      {allocations.length === 0 ? (
        <EmptyPanel
          title="No bulk allocations for this batch"
          action={addButton}
        >
          Allocate kg from the public pool to NParks, schools or community
          gardens.
        </EmptyPanel>
      ) : (
        <Panel
          title="Bulk allocations"
          description="NParks, schools, town councils and community gardens"
          actions={addButton}
        >
          <div className="flex flex-wrap gap-3">
            <Chip icon={<Truck size={14} weight="bold" aria-hidden />}>
              {formatKg(batch.pool.allocatedKg)}kg allocated from this batch
            </Chip>
            <Chip icon={<Scales size={14} weight="bold" aria-hidden />}>
              {formatKg(unallocated)}kg still unallocated in the public pool
            </Chip>
          </div>
          <DataTable
            head={[
              "Taker",
              "Category",
              "kg allocated",
              "Monthly target vs allocated",
              "Status",
              "Actions",
            ]}
          >
            {allocations.map((a) => {
              const kg = Number(a.allocatedKg);
              const live = a.status === "PLANNED" || a.status === "CONFIRMED";
              return (
                <tr key={a.id} className={rowClass}>
                  <td className={tdClass}>
                    <strong>{a.taker.name}</strong>
                  </td>
                  <td className={tdClass}>
                    {a.taker.category ? (
                      <Chip tone="soil">
                        {TAKER_CATEGORY_LABEL[a.taker.category]}
                      </Chip>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={tdClass}>
                    {a.status === "CANCELLED" ? (
                      <s className="text-muted">{formatKg(kg)}kg</s>
                    ) : (
                      <strong>{formatKg(kg)}kg</strong>
                    )}
                  </td>
                  <td className={tdClass}>
                    <MonthlyTarget
                      target={a.taker.monthlyKgTarget}
                      allocated={monthlyByTaker.get(a.takerId) ?? 0}
                    />
                  </td>
                  <td className={tdClass}>
                    <Badge tone={STATUS_TONE[a.status]} size="sm">
                      {ALLOCATION_STATUS_LABEL[a.status]}
                    </Badge>
                  </td>
                  <td className={tdClass}>
                    {live ? (
                      <div className="flex gap-3.5 whitespace-nowrap text-[13px] font-bold">
                        {a.status === "PLANNED" && (
                          <button
                            type="button"
                            disabled={confirming === a.id}
                            onClick={() => void confirm(a)}
                            className="text-deep underline underline-offset-2 disabled:opacity-50"
                          >
                            {confirming === a.id ? "Confirming…" : "Confirm"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setSheet({ kind: "edit", allocation: a })
                          }
                          className="text-deep underline underline-offset-2"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSheet({ kind: "cancel", allocation: a })
                          }
                          className="text-error underline underline-offset-2"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </Panel>
      )}

      {(sheet?.kind === "add" || sheet?.kind === "edit") && (
        <AllocationSheet
          batch={batch}
          editing={sheet.kind === "edit" ? sheet.allocation : null}
          monthlyByTaker={monthlyByTaker}
          onClose={() => setSheet(null)}
          onDone={(msg) => {
            setSheet(null);
            onChanged(msg);
          }}
        />
      )}
      {sheet?.kind === "cancel" && (
        <CancelAllocationSheet
          allocation={sheet.allocation}
          onClose={() => setSheet(null)}
          onDone={(msg) => {
            setSheet(null);
            onChanged(msg);
          }}
        />
      )}
    </>
  );
}

function MonthlyTarget({
  target,
  allocated,
}: {
  target: number | null;
  allocated: number;
}) {
  if (!target) {
    return (
      <span className="text-xs text-muted">
        No monthly target · {formatKg(allocated)}kg this month
      </span>
    );
  }
  return (
    <div className="flex min-w-[180px] flex-col gap-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted">This month</span>
        <strong>
          {formatKg(allocated)} / {formatKg(target)}kg
        </strong>
      </div>
      <ProgressBar
        value={allocated}
        max={target}
        label={`${formatKg(allocated)} of ${formatKg(target)} kg allocated this month`}
      />
    </div>
  );
}

interface BulkOption {
  id: string;
  name: string;
  category: TakerCategoryValue | null;
  monthlyKgTarget: number | null;
}

/** Add (pick a bulk taker) or edit (amount + note) an allocation. */
function AllocationSheet({
  batch,
  editing,
  monthlyByTaker,
  onClose,
  onDone,
}: {
  batch: Batch;
  editing: Allocation | null;
  monthlyByTaker: Map<string, number>;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [takers, setTakers] = useState<BulkOption[] | null>(
    editing ? [editing.taker] : null,
  );
  const [takersError, setTakersError] = useState(false);
  const [takerId, setTakerId] = useState(editing?.takerId ?? "");
  const [kg, setKg] = useState(
    editing ? String(Number(editing.allocatedKg)) : "",
  );
  const [note, setNote] = useState(editing?.note ?? "");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    api
      .get<Paginated<TakerRecord>>(
        "/takers?type=BULK&status=APPROVED&pageSize=100",
      )
      .then((page) => {
        if (cancelled) return;
        setTakers(page.data);
        if (page.data[0]) setTakerId((id) => id || page.data[0].id);
      })
      .catch(() => !cancelled && setTakersError(true));
    return () => {
      cancelled = true;
    };
  }, [editing]);

  const taker = takers?.find((t) => t.id === takerId) ?? null;
  // Editing frees the allocation's own kg first.
  const available =
    Math.max(0, batch.pool.kgRemaining) +
    (editing ? Number(editing.allocatedKg) : 0);
  const monthSoFar =
    (monthlyByTaker.get(takerId) ?? 0) -
    (editing ? Number(editing.allocatedKg) : 0);
  const amount = Number(kg);
  const kgError =
    kg === "" || !(amount > 0)
      ? "Enter how many kg to allocate"
      : amount > available
        ? `Only ${formatKg(available)}kg is unallocated in the public pool. Enter ${formatKg(available)}kg or less.`
        : null;
  const takerError = !editing && !takerId ? "Pick a bulk taker" : null;

  const helper =
    taker && taker.monthlyKgTarget && amount > 0 && !kgError
      ? `Up to ${formatKg(available)}kg available · brings ${taker.name} to ${formatKg(monthSoFar + amount)} / ${formatKg(taker.monthlyKgTarget)}kg this month`
      : `Up to ${formatKg(available)}kg available`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setError(null);
    if (kgError || takerError) return;
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/allocations/${editing.id}`, {
          allocatedKg: amount,
          note: note.trim() || undefined,
        });
        onDone(
          `Allocation updated: ${editing.taker.name} · ${formatKg(amount)}kg`,
        );
      } else {
        await api.post("/allocations", {
          batchId: batch.id,
          takerId,
          allocatedKg: amount,
          note: note.trim() || undefined,
        });
        onDone(
          `Allocated ${formatKg(amount)}kg to ${taker?.name ?? "the taker"}.`,
        );
      }
    } catch (err) {
      setSaving(false);
      setError(friendlyError(err));
    }
  }

  return (
    <Sheet labelledBy="alloc-title" onClose={onClose}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <h3
          id="alloc-title"
          className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep"
        >
          {editing ? "Edit allocation" : "Add allocation"}
        </h3>
        {error && <FormErrorBanner>{error}</FormErrorBanner>}

        <div className="flex flex-col gap-2">
          {editing ? (
            <Field
              id="al-t"
              label="Bulk taker"
              value={editing.taker.name}
              disabled
            />
          ) : takersError ? (
            <FormErrorBanner>
              We couldn’t load the bulk takers. Close this and try again.
            </FormErrorBanner>
          ) : takers === null ? (
            <p className="text-small text-muted">Loading bulk takers…</p>
          ) : takers.length === 0 ? (
            <p className="rounded-control bg-amber-tint px-4 py-3 text-small text-amber-ink">
              No approved bulk takers yet. Add one under Takers first.
            </p>
          ) : (
            <SelectField
              id="al-t"
              label="Bulk taker"
              value={takerId}
              onChange={(e) => setTakerId(e.target.value)}
              errorText={attempted ? takerError : undefined}
            >
              {takers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </SelectField>
          )}
          {taker && (
            <div className="flex flex-col gap-2 rounded-control bg-white p-3.5 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                {taker.category && (
                  <Chip tone="soil">
                    {TAKER_CATEGORY_LABEL[taker.category]}
                  </Chip>
                )}
                <span className="text-muted">
                  {taker.monthlyKgTarget ? (
                    <>
                      Monthly target{" "}
                      <strong className="text-ink">
                        {formatKg(taker.monthlyKgTarget)}kg
                      </strong>{" "}
                      ·{" "}
                    </>
                  ) : (
                    "No monthly target · "
                  )}
                  allocated this month{" "}
                  <strong className="text-ink">{formatKg(monthSoFar)}kg</strong>
                </span>
              </div>
              {taker.monthlyKgTarget ? (
                <ProgressBar
                  value={monthSoFar}
                  max={taker.monthlyKgTarget}
                  label={`${formatKg(monthSoFar)} of ${formatKg(taker.monthlyKgTarget)} kg allocated this month`}
                />
              ) : null}
            </div>
          )}
        </div>

        <Field
          id="al-kg"
          label="kg to allocate"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.1"
          value={kg}
          onChange={(e) => setKg(e.target.value)}
          helperText={helper}
          errorText={
            (attempted || amount > available) && kgError ? kgError : undefined
          }
          required
        />
        <Field
          id="al-note"
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. For the park beds"
          maxLength={500}
        />
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
            loading={saving}
            disabled={!editing && !taker}
          >
            {editing ? "Save changes" : "Add allocation"}
          </Button>
        </SheetActions>
      </form>
    </Sheet>
  );
}

/** No board for this confirm — mirrors the claim cancel pattern. POST /allocations/:id/cancel. */
function CancelAllocationSheet({
  allocation,
  onClose,
  onDone,
}: {
  allocation: Allocation;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kg = formatKg(Number(allocation.allocatedKg));

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/allocations/${allocation.id}/cancel`, {
        note: note.trim() || undefined,
      });
      onDone(`Allocation cancelled. ${kg}kg is back in the public pool.`);
    } catch (err) {
      setSaving(false);
      setError(friendlyError(err));
    }
  }

  return (
    <Sheet labelledBy="alloc-cancel-title" onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <h3
          id="alloc-cancel-title"
          className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep"
        >
          Cancel {allocation.taker.name}’s allocation?
        </h3>
        <span className="text-body text-muted">
          Its {kg}kg goes back into the public pool.
        </span>
      </div>
      {error && <FormErrorBanner>{error}</FormErrorBanner>}
      <Field
        id="alc-note"
        label="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Couldn’t make the pickup this month"
        maxLength={500}
      />
      <SheetActions>
        <Button
          variant="secondary"
          size="md"
          className="px-[18px]"
          onClick={onClose}
        >
          Keep it
        </Button>
        <Button
          variant="danger"
          size="md"
          className="px-[18px]"
          loading={saving}
          onClick={() => void confirm()}
        >
          Cancel allocation
        </Button>
      </SheetActions>
    </Sheet>
  );
}
