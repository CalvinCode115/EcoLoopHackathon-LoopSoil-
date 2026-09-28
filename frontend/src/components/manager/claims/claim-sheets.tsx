"use client";

import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { useState, type FormEvent } from "react";
import { FormErrorBanner } from "@/components/auth/auth-layout";
import { SheetActions } from "@/components/manager/batch-detail/batch-sheets";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { formatKg } from "@/lib/format";
import {
  REJECTION_REASON_MANAGER_LABEL,
  friendlyError,
  type RejectionReason,
} from "@/lib/labels";
import type { Claim } from "@/lib/types";

const titleClass =
  "font-display m-0 text-[22px] font-semibold leading-[30px] text-deep";

/** Board "Claims · reject": reason + note to taker (required for "Other"), with a preview. */
export function RejectClaimSheet({
  claim,
  onClose,
  onDone,
}: {
  claim: Claim;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState<RejectionReason>("INSUFFICIENT_SUPPLY");
  const [note, setNote] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteMissing = reason === "OTHER" && !note.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (noteMissing) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/claims/${claim.id}/reject`, {
        rejectionReason: reason,
        reasonNote: note.trim() || undefined,
      });
      onDone(`Claim rejected · ${claim.reference}`);
    } catch (err) {
      setSaving(false);
      setError(friendlyError(err));
    }
  }

  return (
    <Sheet labelledBy="reject-title" onClose={onClose}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <h3 id="reject-title" className={titleClass}>
          Reject {claim.reference}?
        </h3>
        {error && <FormErrorBanner>{error}</FormErrorBanner>}
        <SelectField
          id="rj-r"
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as RejectionReason)}
        >
          {(
            Object.keys(REJECTION_REASON_MANAGER_LABEL) as RejectionReason[]
          ).map((r) => (
            <option key={r} value={r}>
              {REJECTION_REASON_MANAGER_LABEL[r]}
            </option>
          ))}
        </SelectField>
        <TextAreaField
          id="rj-n"
          label={
            reason === "OTHER" ? "Note to taker" : "Note to taker (optional)"
          }
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          helperText="Required when the reason is “Other”"
          errorText={
            attempted && noteMissing
              ? "Add a note so the taker knows why"
              : undefined
          }
          maxLength={500}
        />
        <div className="flex flex-col gap-1 rounded-control bg-surface p-3.5 text-small shadow-[inset_0_0_0_1px_rgba(var(--rgb-edge),0.3)]">
          <span className="text-xs font-bold text-muted">
            The taker will see:
          </span>
          <span>
            “Your claim {claim.reference} was not approved.{" "}
            <strong>{REJECTION_REASON_MANAGER_LABEL[reason]}</strong>
            {note.trim() && ` · ${note.trim()}`}”
          </span>
        </div>
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
            variant="danger"
            size="md"
            className="px-[18px]"
            loading={saving}
          >
            Reject claim
          </Button>
        </SheetActions>
      </form>
    </Sheet>
  );
}

export interface BulkPreview {
  claim: Claim;
  /** Why it will likely be skipped (unapproved taker, not enough stock) — null if it should go through. */
  skipReason: string | null;
}

/**
 * Board "Claims · bulk approve confirm". The skip preview is a best guess from what's on
 * screen; POST /claims/bulk-approve decides per claim and reports what it actually skipped.
 */
export function BulkApproveSheet({
  items,
  onClose,
  onDone,
}: {
  items: BulkPreview[];
  onClose: () => void;
  onDone: (result: {
    approved: number;
    skipped: { claimId: string; reason: string }[];
  }) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const going = items.filter((i) => !i.skipReason);
  const skipping = items.filter((i) => i.skipReason);
  const kg = going.reduce((s, i) => s + Number(i.claim.requestedKg), 0);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{
        approved: unknown[];
        skipped: { claimId: string; reason: string }[];
      }>("/claims/bulk-approve", { claimIds: going.map((i) => i.claim.id) });
      onDone({ approved: res.approved.length, skipped: res.skipped });
    } catch (err) {
      setSaving(false);
      setError(friendlyError(err));
    }
  }

  return (
    <Sheet labelledBy="bulk-title" onClose={onClose}>
      <h3 id="bulk-title" className={titleClass}>
        Approve {going.length} claim{going.length === 1 ? "" : "s"} totalling{" "}
        {formatKg(kg)}kg?
      </h3>
      {error && <FormErrorBanner>{error}</FormErrorBanner>}
      <ul className="m-0 flex list-none flex-col rounded-control bg-surface p-0 px-3.5 shadow-[inset_0_0_0_1px_rgba(var(--rgb-edge),0.3)]">
        {going.map(({ claim }) => (
          <li
            key={claim.id}
            className="flex items-center justify-between gap-3 py-2.5 text-small shadow-[inset_0_-1px_0_rgba(var(--rgb-hair),0.14)] last:shadow-none"
          >
            <span className="min-w-0 truncate">
              <strong>{claim.taker?.name}</strong>{" "}
              <span className="text-muted">
                · {claim.reference} · {claim.batch?.reference}
              </span>
            </span>
            <strong>{formatKg(Number(claim.requestedKg))}kg</strong>
          </li>
        ))}
      </ul>
      {skipping.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-control bg-amber-tint p-3.5 text-small text-amber-ink">
          <strong className="flex items-center gap-1.5">
            <WarningCircle size={16} weight="bold" aria-hidden />
            {skipping.length} claim{skipping.length === 1 ? "" : "s"} will be
            skipped
          </strong>
          {skipping.map(({ claim, skipReason }) => (
            <span key={claim.id}>
              <strong>{claim.taker?.name}</strong> · {claim.reference} ·{" "}
              {formatKg(Number(claim.requestedKg))}kg · {skipReason}
            </span>
          ))}
        </div>
      )}
      <p className="text-[13px] text-muted">
        Skipped claims stay in the Pending queue so you can review them one by
        one.
      </p>
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
          loading={saving}
          disabled={going.length === 0}
          onClick={() => void confirm()}
        >
          Approve {going.length} claim{going.length === 1 ? "" : "s"}
        </Button>
      </SheetActions>
    </Sheet>
  );
}

/**
 * Overdue approved claim (board "Claims · overdue"). With a booking: POST /bookings/:id/no-show.
 * Never booked: the manager cancels the claim instead (reason "Can't make the pickup"),
 * since there is no booking to mark. Either way the kg goes back to the batch.
 */
export function ReleaseClaimSheet({
  claim,
  onClose,
  onDone,
}: {
  claim: Claim;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const booking = claim.booking?.status === "BOOKED" ? claim.booking : null;
  const kg = formatKg(Number(claim.approvedKg ?? claim.requestedKg));

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      if (booking) {
        await api.post(`/bookings/${booking.id}/no-show`);
        onDone(
          `Marked as no-show · ${claim.reference}. ${kg}kg is back in ${claim.batch?.reference}.`,
        );
      } else {
        await api.post(`/claims/${claim.id}/cancel`, {
          cancellationReason: "CANNOT_MAKE_PICKUP",
          reasonNote: "Not collected by the deadline",
        });
        onDone(
          `Claim released · ${claim.reference}. ${kg}kg is back in ${claim.batch?.reference}.`,
        );
      }
    } catch (err) {
      setSaving(false);
      setError(friendlyError(err));
    }
  }

  return (
    <Sheet labelledBy="release-title" onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <h3 id="release-title" className={titleClass}>
          {booking
            ? `Mark ${claim.reference} as a no-show?`
            : `Release ${claim.reference}?`}
        </h3>
        <span className="text-body text-muted">
          {booking
            ? `${claim.taker?.name ?? "The taker"} didn’t collect. Their ${kg}kg goes back to ${claim.batch?.reference} and the no-show is counted on their record.`
            : `${claim.taker?.name ?? "The taker"} never booked a pickup. The claim is cancelled and its ${kg}kg goes back to ${claim.batch?.reference}.`}
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
          Keep claim
        </Button>
        <Button
          variant="danger"
          size="md"
          className="px-[18px]"
          loading={saving}
          onClick={() => void confirm()}
        >
          {booking ? "Mark no-show" : "Release claim"}
        </Button>
      </SheetActions>
    </Sheet>
  );
}
