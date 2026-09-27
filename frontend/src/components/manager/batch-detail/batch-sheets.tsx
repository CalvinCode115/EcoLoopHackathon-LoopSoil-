"use client";

import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { useState, type FormEvent, type ReactNode } from "react";
import { FormErrorBanner } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { formatKg } from "@/lib/format";
import { friendlyError } from "@/lib/labels";
import type { Batch } from "@/lib/types";

const MAX_TOPUP_KG = 100000;

/** Board "Top up stock": add kg (+ note), preview the new total and remaining. POST /batches/:id/topup. */
export function TopUpSheet({
  batch,
  onClose,
  onDone,
}: {
  batch: Batch;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [kg, setKg] = useState("");
  const [note, setNote] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = Number(kg);
  const valid = kg !== "" && add > 0 && add <= MAX_TOPUP_KG;
  const total = batch.pool.totalKg;
  const remaining = Math.max(0, batch.pool.kgRemaining);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/batches/${batch.id}/topup`, {
        kg: add,
        note: note.trim() || undefined,
      });
      onDone(`Added ${formatKg(add)}kg to ${batch.reference}.`);
    } catch (err) {
      setSaving(false);
      setError(friendlyError(err));
    }
  }

  return (
    <Sheet labelledBy="topup-title" onClose={onClose}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <h3
          id="topup-title"
          className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep"
        >
          Top up stock
        </h3>
        <div className="flex items-center justify-between rounded-control bg-sage px-3.5 py-3">
          <strong>{batch.reference}</strong>
          <span className="text-small text-deep">
            {formatKg(total)}kg total · {formatKg(remaining)}kg remaining
          </span>
        </div>
        {error && <FormErrorBanner>{error}</FormErrorBanner>}
        <Field
          id="tu-kg"
          label="Add kg"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.1"
          value={kg}
          onChange={(e) => setKg(e.target.value)}
          helperText="Weighed at the bin centre"
          errorText={
            attempted && !valid
              ? "Enter how many kg you’re adding (more than 0)"
              : undefined
          }
          required
          autoFocus
        />
        <Field
          id="tu-note"
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Daily generation 29 Sep"
          maxLength={500}
        />
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-control bg-white p-3.5 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]">
          <div>
            <span className="text-xs text-muted">Total now</span>
            <div className="font-display text-2xl font-semibold text-deep">
              {formatKg(total)}kg
            </div>
          </div>
          <ArrowRight size={20} className="text-leaf" aria-hidden />
          <div>
            <span className="text-xs text-muted">New total</span>
            <div className="font-display text-2xl font-semibold text-leaf">
              {valid ? `${formatKg(total + add)}kg` : "—"}
            </div>
          </div>
        </div>
        <p className="text-[13px] leading-[21px] text-muted">
          {valid
            ? `Remaining goes from ${formatKg(remaining)}kg to ${formatKg(remaining + add)}kg. Takers see the new amount straight away.`
            : "Takers see the new amount straight away."}
        </p>
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
          >
            Confirm top-up
          </Button>
        </SheetActions>
      </form>
    </Sheet>
  );
}

/** Board "Close claiming for …?": what stays active, then POST /batches/:id/close. */
export function CloseClaimingSheet({
  batch,
  pendingClaims,
  upcomingSlots,
  onClose,
  onDone,
}: {
  batch: Batch;
  pendingClaims: number | null;
  upcomingSlots: number | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/batches/${batch.id}/close`);
      onDone(`Claiming closed for ${batch.reference}.`);
    } catch (err) {
      setSaving(false);
      setError(friendlyError(err));
    }
  }

  return (
    <Sheet labelledBy="close-title" onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <h3
          id="close-title"
          className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep"
        >
          Close claiming for {batch.reference}?
        </h3>
        <span className="text-body text-muted">
          Takers can no longer claim from this batch. Existing claims stay
          active.
        </span>
      </div>
      {error && <FormErrorBanner>{error}</FormErrorBanner>}
      <Facts
        rows={[
          ["Batch", batch.reference],
          [
            "Remaining",
            `${formatKg(Math.max(0, batch.pool.kgRemaining))}kg (moves to Closed)`,
          ],
          [
            "Pending claims",
            pendingClaims == null
              ? "—"
              : pendingClaims === 0
                ? "None"
                : `${pendingClaims} · still need a decision`,
          ],
          [
            "Upcoming pickups",
            upcomingSlots == null
              ? "—"
              : upcomingSlots === 0
                ? "None"
                : `${upcomingSlots} slot${upcomingSlots === 1 ? "" : "s"} stay open`,
          ],
        ]}
      />
      <SheetActions>
        <Button
          variant="secondary"
          size="md"
          className="px-[18px]"
          onClick={onClose}
        >
          Keep open
        </Button>
        <Button
          size="md"
          className="px-[18px]"
          loading={saving}
          onClick={() => void confirm()}
        >
          Close claiming
        </Button>
      </SheetActions>
    </Sheet>
  );
}

/**
 * Mark completed (Closed header). The design has no board for this confirm; it follows the
 * Close claiming dialog because completing is final. POST /batches/:id/complete.
 */
export function CompleteSheet({
  batch,
  onClose,
  onDone,
}: {
  batch: Batch;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/batches/${batch.id}/complete`);
      onDone(`${batch.reference} marked completed.`);
    } catch (err) {
      setSaving(false);
      setError(friendlyError(err));
    }
  }

  return (
    <Sheet labelledBy="complete-title" onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <h3
          id="complete-title"
          className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep"
        >
          Mark {batch.reference} as completed?
        </h3>
        <span className="text-body text-muted">
          The batch becomes view only. Every claim and allocation must already
          be collected or released.
        </span>
      </div>
      {error && <FormErrorBanner>{error}</FormErrorBanner>}
      <SheetActions>
        <Button
          variant="secondary"
          size="md"
          className="px-[18px]"
          onClick={onClose}
        >
          Not yet
        </Button>
        <Button
          size="md"
          className="px-[18px]"
          loading={saving}
          onClick={() => void confirm()}
        >
          Mark completed
        </Button>
      </SheetActions>
    </Sheet>
  );
}

/**
 * Delete a batch logged by mistake (no design board — follows the other confirm dialogs).
 * The backend only allows it while nothing points at the batch: no claims, allocations or
 * pickup slots, and never once Completed. DELETE /batches/:id.
 */
export function DeleteBatchSheet({
  batch,
  onClose,
  onDone,
}: {
  batch: Batch;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await api.del(`/batches/${batch.id}`);
      onDone(`Batch ${batch.reference} deleted.`);
    } catch (err) {
      setSaving(false);
      setError(friendlyError(err));
    }
  }

  return (
    <Sheet labelledBy="delete-title" onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <h3
          id="delete-title"
          className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep"
        >
          Delete batch {batch.reference}?
        </h3>
        <span className="text-body text-muted">
          This can’t be undone.
          {batch.status !== "DRAFT" &&
            " Takers will no longer see it."} Its {formatKg(batch.pool.totalKg)}
          kg and any top-ups are removed with it.
        </span>
      </div>
      {error && <FormErrorBanner>{error}</FormErrorBanner>}
      <SheetActions>
        <Button
          variant="secondary"
          size="md"
          className="px-[18px]"
          onClick={onClose}
        >
          Keep batch
        </Button>
        <Button
          variant="danger"
          size="md"
          className="px-[18px]"
          loading={saving}
          onClick={() => void confirm()}
        >
          Delete batch
        </Button>
      </SheetActions>
    </Sheet>
  );
}

export function SheetActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2.5">{children}</div>;
}

export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[140px_minmax(0,1fr)] rounded-control bg-white px-3.5 text-small shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="py-2.5 text-muted shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]">
            {k}
          </dt>
          <dd className="m-0 py-2.5 font-semibold shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)]">
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}
