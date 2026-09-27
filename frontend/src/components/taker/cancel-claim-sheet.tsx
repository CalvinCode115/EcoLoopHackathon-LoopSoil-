"use client";

import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import { useEffect, useRef, useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatKg } from "@/lib/format";
import {
  CANCELLATION_REASON_LABEL,
  friendlyError,
  type CancellationReason,
} from "@/lib/labels";
import type { Claim } from "@/lib/types";

const REASONS = Object.keys(CANCELLATION_REASON_LABEL) as CancellationReason[];

/**
 * "Why are you cancelling?" — bottom sheet on phones, centred dialog from 768px.
 * A reason is required (backend rule); "Other" also needs a note. Approved claims get a
 * warning that their reserved kg (and any booked slot) will be released.
 * POST /claims/:id/cancel { cancellationReason, reasonNote? }.
 */
export function CancelClaimSheet({
  claim,
  onClose,
  onCancelled,
}: {
  claim: Claim;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [reason, setReason] = useState<CancellationReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNoteError, setShowNoteError] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus into the dialog, lock page scroll, Esc closes, focus returns on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  const approved = claim.status === "APPROVED";
  const kg = formatKg(Number(claim.approvedKg ?? claim.requestedKg));
  const booked = claim.booking?.status === "BOOKED";
  const needsNote = reason === "OTHER" && !note.trim();

  async function submit() {
    if (!reason) return;
    if (needsNote) {
      setShowNoteError(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/claims/${claim.id}/cancel`, {
        cancellationReason: reason,
        ...(note.trim() ? { reasonNote: note.trim() } : {}),
      });
      onCancelled();
    } catch (err) {
      setError(
        friendlyError(err, "Couldn’t cancel this claim. Please try again."),
      );
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center md:p-6">
      <div
        aria-hidden
        className="absolute inset-0 bg-[rgba(28,36,22,0.5)]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
        className="relative flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-3xl bg-cream px-5 pb-6 pt-3 shadow-photo md:max-w-[480px] md:rounded-3xl md:p-7"
      >
        <span
          aria-hidden
          className="h-1 w-10 self-center rounded-sm bg-[#CFC9BA] md:hidden"
        />
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2
              id="cancel-title"
              className="font-display m-0 text-2xl font-semibold leading-8 text-deep"
            >
              Why are you cancelling?
            </h2>
            <p className="text-small text-muted">
              {claim.reference} ·{" "}
              {approved ? `Approved ${kg}kg` : `Requested ${kg}kg`}
            </p>
          </div>
          <IconButton
            ref={closeRef}
            label="Close"
            onClick={onClose}
            className="-mr-2.5 -mt-1.5 rounded-control"
          >
            <X size={22} />
          </IconButton>
        </div>

        {approved && (
          <div className="flex items-start gap-2.5 rounded-control bg-amber-tint p-3 text-small font-semibold text-amber-ink">
            <WarningCircle
              size={18}
              weight="bold"
              className="mt-px shrink-0"
              aria-hidden
            />
            <span>
              This claim is approved. Your reserved {kg}kg will be released to
              others
              {booked ? " and your pickup slot freed" : ""}.
            </span>
          </div>
        )}

        <fieldset className="m-0 flex flex-col gap-2 border-none p-0">
          <legend className="sr-only">Reason</legend>
          {REASONS.map((r) => {
            const checked = reason === r;
            return (
              <label
                key={r}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-3 rounded-control px-3.5 text-body",
                  checked
                    ? "bg-sage font-semibold shadow-[inset_0_0_0_2px_var(--color-leaf)]"
                    : "bg-white shadow-[inset_0_0_0_1px_rgba(143,142,128,0.5)]",
                )}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={checked}
                  onChange={() => {
                    setReason(r);
                    setShowNoteError(false);
                  }}
                  className="m-0 size-5 accent-leaf"
                />
                {CANCELLATION_REASON_LABEL[r]}
              </label>
            );
          })}
        </fieldset>

        {reason === "OTHER" && (
          <TextAreaField
            label="Tell us a bit more"
            placeholder="e.g. I’ll be overseas that week"
            rows={3}
            required
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setShowNoteError(false);
            }}
            helperText="Required when you choose “Other”."
            errorText={
              showNoteError
                ? "Please tell us why you’re cancelling."
                : undefined
            }
            autoFocus
          />
        )}

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-control bg-danger-tint px-4 py-3 text-small font-semibold text-danger-ink"
          >
            <WarningCircle
              size={18}
              weight="bold"
              className="shrink-0"
              aria-hidden
            />
            <span>{error}</span>
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            fullWidth
            disabled={!reason}
            loading={busy}
            onClick={() => void submit()}
          >
            {busy ? "Cancelling…" : "Cancel claim"}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={onClose}
            disabled={busy}
          >
            Keep my claim
          </Button>
        </div>
      </div>
    </div>
  );
}
