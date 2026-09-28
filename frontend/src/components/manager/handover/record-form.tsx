"use client";

import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { Camera } from "@phosphor-icons/react/dist/ssr/Camera";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { Images } from "@phosphor-icons/react/dist/ssr/Images";
import { Minus } from "@phosphor-icons/react/dist/ssr/Minus";
import { Plus } from "@phosphor-icons/react/dist/ssr/Plus";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { WifiSlash } from "@phosphor-icons/react/dist/ssr/WifiSlash";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sheet } from "@/components/ui/sheet";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  firstName,
  formatClock,
  formatDayMonth,
  formatDayTime,
  formatKg,
  formatTimeRange,
  sgDayKey,
} from "@/lib/format";
import { friendlyError } from "@/lib/labels";
import type { HandoverLookup } from "@/lib/types";
import { BigButton, CountStepper, StepCard, TypeTag } from "./handover-ui";

/** Server rule: at most 10% over the approved / allocated kg. */
const OVER_TOLERANCE = 0.1;

export interface RecordedHandover {
  id: string;
  reference: string;
  kg: number;
  name: string;
}

/**
 * Record handover (boards "Handover · record / filled / warn / saving / save error /
 * upload fail / offline / summary" and the edge boards). Blocking lookups show why and a
 * way out; warnings (no booking, past deadline, wrong day) ask "Record anyway" first.
 * POST /handovers (multipart): the target, actualKg off the scale, the packing breakdown,
 * the required photo and a note.
 */
export function RecordHandover({
  lookup,
  now,
  online,
  onBack,
  onRecorded,
}: {
  lookup: HandoverLookup;
  now: number;
  online: boolean;
  onBack: () => void;
  onRecorded: (h: RecordedHandover) => void;
}) {
  const blocking = lookup.issues.filter((i) => i.blocking);
  const warnings = lookup.issues.filter((i) => !i.blocking);
  const [acknowledged, setAcknowledged] = useState(warnings.length === 0);

  if (blocking.length > 0 || !acknowledged) {
    return (
      <div className="flex flex-col gap-3">
        {(blocking.length ? blocking : warnings).map((i) => (
          <IssueBanner
            key={i.code}
            lookup={lookup}
            code={i.code}
            blocking={i.blocking}
            now={now}
          />
        ))}
        <IdentityCard lookup={lookup} now={now} />
        <div className="flex flex-col gap-2.5">
          {blocking.length === 0 ? (
            <>
              <BigButton
                icon={<ArrowRight size={20} />}
                onClick={() => setAcknowledged(true)}
              >
                Record anyway
              </BigButton>
              <BigButton variant="secondary" onClick={onBack}>
                Cancel
              </BigButton>
            </>
          ) : (
            <>
              {blocking.some((i) => i.code === "NOT_APPROVED") &&
                lookup.kind === "CLAIM" && (
                  <Link
                    href={`/manager/claims?claim=${lookup.id}`}
                    className="flex min-h-14 items-center justify-center rounded-[14px] bg-leaf px-[18px] text-[17px] font-bold text-cream no-underline hover:bg-deep"
                  >
                    Open in Claims
                  </Link>
                )}
              {blocking.some((i) => i.code === "TAKER_SUSPENDED") && (
                <Link
                  href={`/manager/takers?taker=${lookup.taker.id}`}
                  className="flex min-h-14 items-center justify-center rounded-[14px] bg-leaf px-[18px] text-[17px] font-bold text-cream no-underline hover:bg-deep"
                >
                  View taker profile
                </Link>
              )}
              <BigButton variant="secondary" onClick={onBack}>
                Back to list
              </BigButton>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <RecordForm
      lookup={lookup}
      warnings={warnings}
      now={now}
      online={online}
      onRecorded={onRecorded}
    />
  );
}

function RecordForm({
  lookup,
  warnings,
  now,
  online,
  onRecorded,
}: {
  lookup: HandoverLookup;
  warnings: HandoverLookup["issues"];
  now: number;
  online: boolean;
  onRecorded: (h: RecordedHandover) => void;
}) {
  const [actual, setActual] = useState("");
  const [half, setHalf] = useState(0);
  const [one, setOne] = useState(0);
  const [loose, setLoose] = useState("");
  const [photo, setPhoto] = useState<{
    file: File;
    url: string;
    at: number;
  } | null>(null);
  const [note, setNote] = useState("");
  const [overOk, setOverOk] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // Free the preview's object URL when the photo is replaced or the form closes.
  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  const actualKg = Math.round(Number(actual) * 1000) / 1000;
  const hasActual = actual !== "" && actualKg > 0;
  const packed =
    Math.round((half * 0.5 + one + (Number(loose) || 0)) * 1000) / 1000;
  const mismatch =
    hasActual && packed > 0 && Math.abs(packed - actualKg) > 0.001;
  const ceiling = Math.round(lookup.kg * (1 + OVER_TOLERANCE) * 1000) / 1000;
  const over = hasActual && actualKg > lookup.kg + 0.0005;
  const tooMuch = hasActual && actualKg > ceiling + 0.0005;
  const ready =
    hasActual &&
    !!photo &&
    !photoFailed &&
    !tooMuch &&
    (!over || overOk) &&
    online;

  function step(delta: number) {
    const next = Math.max(
      0,
      Math.round(((Number(actual) || 0) + delta) * 10) / 10,
    );
    setActual(next ? String(next) : "");
    setOverOk(false);
  }

  function pick(file: File | undefined) {
    if (!file) return;
    setPhoto({ file, url: URL.createObjectURL(file), at: Date.now() });
    setPhotoFailed(false);
  }

  async function save() {
    if (!ready || !photo) return;
    setSaving(true);
    setError(null);
    const form = new FormData();
    if (lookup.booking?.status === "BOOKED")
      form.append("bookingId", lookup.booking.id);
    else
      form.append(
        lookup.kind === "CLAIM" ? "claimId" : "allocationId",
        lookup.id,
      );
    form.append("actualKg", String(actualKg));
    form.append("halfKgBags", String(half));
    form.append("oneKgBags", String(one));
    form.append("looseKg", String(Number(loose) || 0));
    if (note.trim()) form.append("note", note.trim());
    form.append("photo", await shrinkPhoto(photo.file), "weigh-in.jpg");
    try {
      const h = await api.postForm<{ id: string; reference: string }>(
        "/handovers",
        form,
      );
      onRecorded({
        id: h.id,
        reference: h.reference,
        kg: actualKg,
        name: lookup.taker.name,
      });
    } catch (err) {
      setSaving(false);
      setConfirming(false);
      if (err instanceof ApiError && err.code === "PHOTO_UPLOAD_FAILED")
        setPhotoFailed(true);
      else
        setError(
          err instanceof ApiError && err.status < 500
            ? friendlyError(err)
            : "Couldn’t save the handover. Please try again.",
        );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!online && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-[14px] bg-amber-tint px-3.5 py-3 text-small font-semibold text-amber-ink"
        >
          <WifiSlash size={20} weight="bold" aria-hidden />
          You’re offline. Keep going — you can confirm once the connection is
          back.
        </div>
      )}
      {warnings.map((i) => (
        <IssueBanner
          key={i.code}
          lookup={lookup}
          code={i.code}
          blocking={false}
          now={now}
          compact
        />
      ))}
      <IdentityCard lookup={lookup} now={now} />

      <StepCard n={1} title="Actual amount" done={hasActual}>
        <div className="flex flex-col gap-2">
          <label htmlFor="h-kg" className="text-[15px] font-semibold">
            Net compost handed over (kg)
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Minus 0.1kg"
              onClick={() => step(-0.1)}
              className="flex h-16 w-14 items-center justify-center rounded-[14px] bg-surface text-deep shadow-[inset_0_0_0_1px_var(--color-edge)] hover:bg-sage"
            >
              <Minus size={22} weight="bold" />
            </button>
            <div className="flex h-16 grow items-center justify-center rounded-[14px] bg-surface shadow-[inset_0_0_0_1px_var(--color-edge)] focus-within:shadow-[inset_0_0_0_2px_var(--color-leaf)]">
              <input
                id="h-kg"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                placeholder="0.0"
                value={actual}
                onChange={(e) => {
                  setActual(e.target.value);
                  setOverOk(false);
                }}
                className="font-display w-[110px] border-none bg-transparent text-right text-[34px] font-semibold text-ink outline-none"
              />
              <span className="pl-1 text-lg font-bold text-muted">kg</span>
            </div>
            <button
              type="button"
              aria-label="Plus 0.1kg"
              onClick={() => step(0.1)}
              className="flex h-16 w-14 items-center justify-center rounded-[14px] bg-surface text-deep shadow-[inset_0_0_0_1px_var(--color-edge)] hover:bg-sage"
            >
              <Plus size={22} weight="bold" />
            </button>
          </div>
          <p className="text-[13px] text-muted">
            Net weight of compost only, without the bag.
          </p>
          <button
            type="button"
            onClick={() => {
              setActual(formatKg(lookup.kg));
              setOverOk(false);
            }}
            className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-control bg-sage px-3.5 text-small font-bold text-deep hover:bg-sage-hover"
          >
            <Check size={16} weight="bold" aria-hidden />
            Match approved amount · {formatKg(lookup.kg)}kg
          </button>
        </div>
        {tooMuch && (
          <Alert tone="red">
            That’s more than 10% over the approved {formatKg(lookup.kg)}kg (max{" "}
            {formatKg(ceiling)}kg). Check the scale reading.
          </Alert>
        )}
        {over && !tooMuch && (
          <Alert tone="amber">
            This is more than the approved {formatKg(lookup.kg)}kg. Continue?
            <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-2.5 text-small font-bold text-ink">
              <input
                type="checkbox"
                checked={overOk}
                onChange={(e) => setOverOk(e.target.checked)}
                className="size-5 accent-[var(--color-leaf)]"
              />
              Yes, continue with the higher amount
            </label>
          </Alert>
        )}
      </StepCard>

      <StepCard n={2} title="How it was packed" done={packed > 0}>
        <CountStepper
          id="h-half"
          label="½kg bags"
          value={half}
          onChange={setHalf}
        />
        <div aria-hidden className="h-px bg-[rgba(var(--rgb-hair),0.14)]" />
        <CountStepper
          id="h-one"
          label="1kg bags"
          value={one}
          onChange={setOne}
        />
        <div aria-hidden className="h-px bg-[rgba(var(--rgb-hair),0.14)]" />
        <div className="flex min-h-14 items-center justify-between gap-2.5">
          <label htmlFor="h-loose" className="text-[15px] font-semibold">
            Loose / scooped
          </label>
          <div className="flex h-12 w-[132px] items-center rounded-control bg-surface shadow-[inset_0_0_0_1px_var(--color-edge)] focus-within:shadow-[inset_0_0_0_2px_var(--color-leaf)]">
            <input
              id="h-loose"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              placeholder="0.0"
              value={loose}
              onChange={(e) => setLoose(e.target.value)}
              className="w-full border-none bg-transparent text-right text-lg font-bold text-ink outline-none"
            />
            <span className="pl-1 pr-3 font-bold text-muted">kg</span>
          </div>
        </div>
        <div
          role="status"
          className="flex items-center justify-between rounded-control bg-well px-3.5 py-3 text-[15px]"
        >
          Bags + loose =
          <strong className="text-lg text-deep">{formatKg(packed)}kg</strong>
        </div>
        {mismatch && (
          <Alert tone="amber">
            Packed total ({formatKg(packed)}kg) doesn’t match actual kg (
            {formatKg(actualKg)}kg).
          </Alert>
        )}
      </StepCard>

      <StepCard n={3} title="Weigh-in photo" done={!!photo && !photoFailed}>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => pick(e.target.files?.[0])}
        />
        {photo ? (
          <div className="flex items-center gap-3.5">
            <Image
              src={photo.url}
              alt="Weigh-in photo of the scale reading"
              width={120}
              height={120}
              unoptimized
              className="size-[120px] shrink-0 rounded-[14px] object-cover"
            />
            <div className="flex flex-col gap-1.5">
              {photoFailed ? (
                <strong className="flex items-center gap-1.5 text-[15px] text-error">
                  <WarningCircle size={18} weight="bold" aria-hidden />
                  Photo didn’t upload.
                </strong>
              ) : (
                <strong className="flex items-center gap-1.5 text-[15px] text-leaf">
                  <CheckCircle size={18} weight="fill" aria-hidden />
                  Photo added
                </strong>
              )}
              <span className="text-[13px] text-muted">
                {formatClock(new Date(photo.at).toISOString())} ·{" "}
                {(photo.file.size / 1_048_576).toFixed(1)} MB
              </span>
              <button
                type="button"
                onClick={() =>
                  photoFailed ? void save() : cameraRef.current?.click()
                }
                className="min-h-11 self-start rounded-control bg-surface px-4 text-[15px] font-bold text-deep shadow-[inset_0_0_0_1.5px_var(--color-leaf)] hover:bg-sage"
              >
                {photoFailed ? "Retry" : "Retake"}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-[14px] bg-leaf text-[15px] font-bold text-cream hover:bg-deep"
            >
              <Camera size={26} aria-hidden />
              Take photo
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-[14px] bg-surface text-[15px] font-bold text-deep shadow-[inset_0_0_0_1.5px_var(--color-leaf)] hover:bg-sage"
            >
              <Images size={26} aria-hidden />
              Upload from gallery
            </button>
          </div>
        )}
        <p className="text-[13px] leading-[21px] text-muted">
          Photo of the scale reading, as proof for the Waste Diary.
        </p>
        {!photo && (
          <span className="text-[13px] font-bold text-amber-ink">
            Required before confirming
          </span>
        )}
      </StepCard>

      <StepCard n={4} title="Confirm">
        <div className="flex flex-col gap-2">
          <label htmlFor="h-note" className="text-small font-semibold">
            Note <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="h-note"
            type="text"
            value={note}
            maxLength={500}
            placeholder="e.g. Taker brought own container"
            onChange={(e) => setNote(e.target.value)}
            className="h-12 rounded-control border-none bg-surface px-4 text-body text-ink shadow-[inset_0_0_0_1px_var(--color-edge)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-leaf),0_0_0_4px_rgba(var(--rgb-leaf),0.25)]"
          />
        </div>
      </StepCard>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-1.5 bg-beige/95 px-4 pb-4 pt-3 shadow-[0_-1px_0_rgba(var(--rgb-hair),0.14),0_-8px_20px_rgba(var(--rgb-shade),0.08)] md:mx-0 md:rounded-card">
        {error && (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-control bg-danger-tint px-3.5 py-2.5 text-small font-semibold text-danger-ink"
          >
            <WarningCircle size={18} weight="bold" aria-hidden />
            {error}
          </p>
        )}
        <BigButton
          className="min-h-[60px]"
          disabled={!ready}
          loading={saving}
          onClick={() => setConfirming(true)}
        >
          {saving
            ? "Saving…"
            : `Confirm handover · ${hasActual ? formatKg(actualKg) : "–"}kg`}
        </BigButton>
        {!ready && !saving && (
          <span className="text-center text-[13px] text-muted">
            {!online
              ? "You’re offline — confirm once you’re back online."
              : photoFailed
                ? "Retry the photo upload to confirm."
                : !hasActual && !photo
                  ? "Add the actual kg and a weigh-in photo to confirm."
                  : !hasActual
                    ? "Add the actual kg to confirm."
                    : !photo
                      ? "Add a weigh-in photo to confirm."
                      : tooMuch
                        ? "The amount is over the limit."
                        : "Confirm the higher amount above."}
          </span>
        )}
      </div>

      {confirming && photo && (
        <Sheet
          labelledBy="confirm-handover-title"
          onClose={() => !saving && setConfirming(false)}
        >
          <h3
            id="confirm-handover-title"
            className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep"
          >
            Confirm this handover?
          </h3>
          <div className="flex items-center gap-3.5">
            <Image
              src={photo.url}
              alt="Weigh-in photo"
              width={88}
              height={88}
              unoptimized
              className="size-[88px] rounded-control object-cover"
            />
            <div>
              <div className="font-display text-[34px] font-semibold leading-10 text-deep">
                {formatKg(actualKg)}
                <span className="text-lg">kg</span>
              </div>
              <span className="text-small text-muted">
                to {lookup.taker.name}
              </span>
            </div>
          </div>
          <dl className="m-0 grid grid-cols-[110px_minmax(0,1fr)] text-small">
            {(
              [
                ["Taker", lookup.taker.name],
                ["Reference", lookup.reference],
                [
                  "Actual kg",
                  `${formatKg(actualKg)}kg (approved ${formatKg(lookup.kg)}kg)`,
                ],
                ["Packed as", packedText(half, one, Number(loose) || 0)],
                [
                  "Slot",
                  lookup.booking?.status === "BOOKED"
                    ? slotLine(lookup, now)
                    : "Walk-in (no booking)",
                ],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="py-2 text-muted shadow-[inset_0_-1px_0_rgba(var(--rgb-hair),0.14)]">
                  {k}
                </dt>
                <dd className="m-0 py-2 font-semibold shadow-[inset_0_-1px_0_rgba(var(--rgb-hair),0.14)]">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <div className="grid grid-cols-2 gap-2.5">
            <BigButton
              variant="secondary"
              disabled={saving}
              onClick={() => setConfirming(false)}
            >
              Edit
            </BigButton>
            <BigButton loading={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Confirm"}
            </BigButton>
          </div>
        </Sheet>
      )}
    </div>
  );
}

// ─── pieces ───────────────────────────────────────────────────────────────────

function IdentityCard({
  lookup,
  now,
}: {
  lookup: HandoverLookup;
  now: number;
}) {
  const label =
    lookup.kind === "ALLOCATION"
      ? "Allocated"
      : lookup.status === "PENDING"
        ? "Requested"
        : "Approved";
  return (
    <section
      aria-label="Verify identity"
      className="flex flex-col gap-3 rounded-[18px] bg-cream p-[18px] shadow-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <strong className="font-display text-[26px] font-semibold leading-8 text-deep">
            {lookup.taker.name}
          </strong>
          {lookup.taker.phone && (
            <a
              href={`tel:+65${lookup.taker.phone.replace(/\D/g, "").slice(-8)}`}
              className="text-[15px] font-semibold text-deep"
            >
              {formatPhone(lookup.taker.phone)}
            </a>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span className="text-xs font-bold text-muted">{label}</span>
          <div className="font-display text-[32px] font-semibold leading-9 text-deep">
            {formatKg(lookup.kg)}
            <span className="text-lg">kg</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-small">
        <strong>{lookup.reference}</strong>
        <TypeTag bulk={lookup.kind === "ALLOCATION"} />
        <span className="text-muted">Batch {lookup.batch.reference}</span>
      </div>
      <div className="flex items-center gap-2 text-small">
        <Clock size={16} className="shrink-0 text-leaf" aria-hidden />
        {slotLine(lookup, now)}
      </div>
      <div className="flex items-center gap-2.5 rounded-control bg-well px-3 py-2.5 text-small font-semibold">
        <ShieldCheck size={18} className="shrink-0 text-leaf" aria-hidden />
        Ask the taker to show their reference to confirm.
      </div>
    </section>
  );
}

function IssueBanner({
  lookup,
  code,
  blocking,
  now,
  compact,
}: {
  lookup: HandoverLookup;
  code: HandoverLookup["issues"][number]["code"];
  blocking: boolean;
  now: number;
  compact?: boolean;
}) {
  const first = firstName(lookup.taker.name);
  const kg = `${formatKg(lookup.kg)}kg`;
  const deadline = lookup.booking?.collectionDeadline;
  const copy: Record<typeof code, [string, ReactNode]> = {
    PAST_DEADLINE: [
      `The collection deadline passed${deadline ? ` on ${formatDayMonth(deadline)}` : ""}`,
      `The ${kg} hasn’t been released yet, so you can still hand it over.`,
    ],
    NO_BOOKING: [
      `No pickup booked for this ${lookup.kind === "CLAIM" ? "claim" : "allocation"}`,
      `${first} was ${lookup.kind === "CLAIM" ? "approved" : "allocated"} ${kg}${lookup.decidedAt ? ` on ${formatDayMonth(lookup.decidedAt)}` : ""} but hasn’t picked a slot. You can still hand it over now — it’s recorded as a walk-in.`,
    ],
    WRONG_DAY: [
      lookup.booking
        ? `This pickup is booked for ${new Date(lookup.booking.slot.startTime).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Singapore" }).replace(",", "")}`
        : "This pickup is booked for another day",
      lookup.booking
        ? `Slot ${formatTimeRange(lookup.booking.slot.startTime, lookup.booking.slot.endTime)}. Recording ${sgDayKey(lookup.booking.slot.startTime) > sgDayKey(new Date(now).toISOString()) ? "today" : "now"} will free that slot.`
        : "",
    ],
    NOT_APPROVED: [
      `This ${lookup.kind === "CLAIM" ? "claim" : "allocation"} can’t be collected · status: ${lookup.status.charAt(0)}${lookup.status.slice(1).toLowerCase()}`,
      lookup.kind === "CLAIM"
        ? "It needs to be approved in Claims first."
        : "Confirm the allocation on its batch first.",
    ],
    RELEASED: [
      lookup.booking?.status === "NO_SHOW"
        ? "The collection deadline passed"
        : "This was cancelled",
      `This compost was released. Ask ${first} to make a new claim.`,
    ],
    TAKER_SUSPENDED: [
      lookup.taker.status === "SUSPENDED"
        ? "This taker’s account is suspended."
        : "This taker’s account isn’t approved.",
      "Handovers are blocked. Check the taker profile for the reason.",
    ],
    ALREADY_COLLECTED: [
      "Already collected",
      lookup.handover
        ? `Collected ${formatDayTime(lookup.handover.handedOverAt)} by ${lookup.handover.handedOverBy} · ${formatKg(lookup.handover.actualKg)}kg`
        : "This pickup was already handed over.",
    ],
  };
  const [title, body] = copy[code];
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-3 rounded-[14px] p-3.5",
        blocking
          ? "bg-danger-tint text-danger-ink"
          : "bg-amber-tint text-amber-ink",
      )}
    >
      <WarningCircle size={22} className="mt-px shrink-0" aria-hidden />
      <div className="flex flex-col gap-1">
        <strong className="text-body leading-[22px]">{title}</strong>
        {!compact && body && (
          <span className="text-small leading-5 text-ink">{body}</span>
        )}
      </div>
    </div>
  );
}

function Alert({
  tone,
  children,
}: {
  tone: "amber" | "red";
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col rounded-control px-3.5 py-3 text-small font-semibold leading-5",
        tone === "amber"
          ? "bg-amber-tint text-amber-ink"
          : "bg-danger-tint text-danger-ink",
      )}
    >
      <span className="flex gap-2.5">
        <WarningCircle
          size={18}
          weight="bold"
          className="mt-px shrink-0"
          aria-hidden
        />
        <span className="flex flex-col">{children}</span>
      </span>
    </div>
  );
}

function slotLine(lookup: HandoverLookup, now: number): string {
  const b = lookup.booking;
  if (!b || b.status !== "BOOKED") {
    return lookup.status === "PENDING"
      ? "No slot · claim pending review"
      : `No slot booked${b?.collectionDeadline ? ` · deadline ${formatDayTime(b.collectionDeadline)}` : ""}`;
  }
  const today =
    sgDayKey(b.slot.startTime) === sgDayKey(new Date(now).toISOString());
  const day = today
    ? "Today"
    : new Date(b.slot.startTime)
        .toLocaleDateString("en-SG", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "Asia/Singapore",
        })
        .replace(",", "");
  return `${day} · ${formatTimeRange(b.slot.startTime, b.slot.endTime)}`;
}

function packedText(half: number, one: number, loose: number): string {
  const parts = [
    one > 0 && `${one} × 1kg bag${one === 1 ? "" : "s"}`,
    half > 0 && `${half} × ½kg bag${half === 1 ? "" : "s"}`,
    loose > 0 && `${formatKg(loose)}kg loose`,
  ].filter(Boolean);
  return parts.length ? parts.join(" + ") : "Not recorded";
}

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "").replace(/^65(?=\d{8}$)/, "");
  return d.length === 8 ? `+65 ${d.slice(0, 4)} ${d.slice(4)}` : phone;
}

/**
 * Phone photos are often 3–8 MB; the bin centre signal isn't. Downscale to 1600px JPEG
 * before upload (the scale reading stays legible). Falls back to the original file.
 */
async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")
      ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", 0.82),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
