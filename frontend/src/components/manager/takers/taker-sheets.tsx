"use client";

import { useEffect, useState, type FormEvent } from "react";
import { FormErrorBanner } from "@/components/auth/auth-layout";
import { SheetActions } from "@/components/manager/batch-detail/batch-sheets";
import { Button } from "@/components/ui/button";
import { Field, SelectField, TextAreaField } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { api, type Paginated } from "@/lib/api";
import { firstName, formatKg } from "@/lib/format";
import { TAKER_CATEGORY_LABEL, friendlyError } from "@/lib/labels";
import type { Allocation, Claim, TakerRecord } from "@/lib/types";

const titleClass =
  "font-display m-0 text-[22px] font-semibold leading-[30px] text-deep";

const DECLINE_REASONS = [
  "Incomplete details",
  "Outside service area",
  "Duplicate account",
  "Other",
] as const;

/** Board "Takers · decline": reason + note (required for Other). POST /takers/:id/decline. */
export function DeclineSheet({
  taker,
  onClose,
  onDone,
}: {
  taker: TakerRecord;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [reason, setReason] =
    useState<(typeof DECLINE_REASONS)[number]>("Incomplete details");
  const [note, setNote] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = reason === "Other" && !note.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (missing) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/takers/${taker.id}/decline`, {
        statusReason: note.trim()
          ? reason === "Other"
            ? note.trim()
            : `${reason}: ${note.trim()}`
          : reason,
      });
      onDone(`${taker.name} declined`);
    } catch (err) {
      setSaving(false);
      setError(
        friendlyError(err, "Couldn’t update this taker. Please try again."),
      );
    }
  }

  return (
    <Sheet labelledBy="decline-title" onClose={onClose}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <h3 id="decline-title" className={titleClass}>
          Decline {taker.name}?
        </h3>
        {error && <FormErrorBanner>{error}</FormErrorBanner>}
        <SelectField
          id="dc-r"
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as typeof reason)}
        >
          {DECLINE_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </SelectField>
        <TextAreaField
          id="dc-n"
          label={reason === "Other" ? "Note" : "Note (optional)"}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          helperText="Required when the reason is “Other”. The taker sees this on their account."
          errorText={
            attempted && missing ? "Add a note so they know why" : undefined
          }
          maxLength={400}
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
            variant="danger"
            size="md"
            className="px-[18px]"
            loading={saving}
          >
            Decline
          </Button>
        </SheetActions>
      </form>
    </Sheet>
  );
}

/**
 * Board "Takers · suspend": lists what will be cancelled (active claims / allocations) and
 * asks for a reason (managers only). POST /takers/:id/suspend — the backend cancels them.
 */
export function SuspendSheet({
  taker,
  onClose,
  onDone,
}: {
  taker: TakerRecord;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<
    { reference: string; kg: number }[] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    const bulk = taker.type === "BULK";
    const req = bulk
      ? api
          .get<Paginated<Allocation>>(
            `/allocations?takerId=${taker.id}&pageSize=100`,
          )
          .then((p) =>
            p.data
              .filter((a) => a.status === "PLANNED" || a.status === "CONFIRMED")
              .map((a) => ({
                reference: a.reference,
                kg: Number(a.allocatedKg),
              })),
          )
      : api
          .get<Paginated<Claim>>(`/claims?takerId=${taker.id}&pageSize=100`)
          .then((p) =>
            p.data
              .filter((c) => c.status === "PENDING" || c.status === "APPROVED")
              .map((c) => ({
                reference: c.reference,
                kg: Number(c.approvedKg ?? c.requestedKg),
              })),
          );
    req.then(
      (a) => !cancelled && setActive(a),
      () => !cancelled && setActive([]),
    );
    return () => {
      cancelled = true;
    };
  }, [taker]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (!reason.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/takers/${taker.id}/suspend`, {
        statusReason: reason.trim(),
      });
      onDone(`${taker.name} suspended`);
    } catch (err) {
      setSaving(false);
      setError(
        friendlyError(err, "Couldn’t update this taker. Please try again."),
      );
    }
  }

  const noun = taker.type === "BULK" ? "allocation" : "claim";
  return (
    <Sheet labelledBy="suspend-title" onClose={onClose}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h3 id="suspend-title" className={titleClass}>
            Suspend {taker.name}?
          </h3>
          <span className="text-body text-muted">
            They won’t be able to claim or receive compost. Their active {noun}s
            will be cancelled.
          </span>
        </div>
        {error && <FormErrorBanner>{error}</FormErrorBanner>}
        {active && active.length > 0 && (
          <p className="rounded-control bg-amber-tint px-3.5 py-2.5 text-small text-amber-ink">
            <strong>
              {active.length} active {noun}
              {active.length === 1 ? "" : "s"} will be cancelled:
            </strong>{" "}
            {active
              .map((a) => `${a.reference} · ${formatKg(a.kg)}kg`)
              .join(", ")}
          </p>
        )}
        <TextAreaField
          id="sp-r"
          label="Reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={`e.g. 2 no-shows this month. Suspending until we speak with ${firstName(taker.name)}.`}
          helperText="Required. Only managers can see this."
          errorText={attempted && !reason.trim() ? "Add a reason" : undefined}
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
            variant="danger"
            size="md"
            className="px-[18px]"
            loading={saving}
          >
            Suspend
          </Button>
        </SheetActions>
      </form>
    </Sheet>
  );
}

/** Boards "Takers · add bulk / errors / error": POST /takers/bulk, or PATCH /takers/:id to edit. */
export function BulkTakerSheet({
  taker,
  onClose,
  onDone,
}: {
  taker?: TakerRecord | null;
  onClose: () => void;
  onDone: (msg: string, created?: TakerRecord) => void;
}) {
  const [name, setName] = useState(taker?.name ?? "");
  const [category, setCategory] = useState(taker?.category ?? "");
  const [target, setTarget] = useState(
    taker?.monthlyKgTarget != null ? String(taker.monthlyKgTarget) : "",
  );
  const [email, setEmail] = useState(taker?.email ?? "");
  const [phone, setPhone] = useState(
    (taker?.phone ?? "").replace(/^\+?65\s?/, ""),
  );
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = {
    name: name.trim().length < 2 ? "Enter the organisation name" : undefined,
    category: !category ? "Choose a category" : undefined,
    target: !(Number(target) > 0) ? "Target must be more than 0" : undefined,
    email: !/^\S+@\S+\.\S+$/.test(email.trim())
      ? "Enter a contact email"
      : undefined,
    phone:
      phone.trim() && !/^\d{8}$/.test(phone.replace(/\s/g, ""))
        ? "Enter an 8-digit Singapore number"
        : undefined,
  };
  const shown: Partial<typeof errors> = attempted ? errors : {};

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (Object.values(errors).some(Boolean)) return;
    setSaving(true);
    setError(null);
    const body = {
      name: name.trim(),
      category,
      monthlyKgTarget: Number(target),
      email: email.trim(),
      phone: phone.trim()
        ? `+65 ${phone.replace(/\s/g, "").replace(/(\d{4})(\d{4})/, "$1 $2")}`
        : undefined,
    };
    try {
      if (taker) {
        await api.patch(`/takers/${taker.id}`, body);
        onDone(`${body.name} updated`);
      } else {
        const created = await api.post<TakerRecord>("/takers/bulk", body);
        onDone(`${body.name} added`, created);
      }
    } catch (err) {
      setSaving(false);
      setError(
        friendlyError(err, "Couldn’t update this taker. Please try again."),
      );
    }
  }

  return (
    <Sheet labelledBy="bulk-taker-title" onClose={onClose}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 id="bulk-taker-title" className={titleClass}>
            {taker ? `Edit ${taker.name}` : "Add bulk taker"}
          </h3>
          <span className="text-small text-muted">
            Bulk takers don’t log in. You’ll allocate and book their compost for
            them.
          </span>
        </div>
        {error && <FormErrorBanner>{error}</FormErrorBanner>}
        <Field
          id="bt-name"
          label="Organisation name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          errorText={shown.name}
          maxLength={120}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="bt-cat"
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            errorText={shown.category}
          >
            <option value="">Choose a category</option>
            {Object.entries(TAKER_CATEGORY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectField>
          <Field
            id="bt-target"
            label="Monthly kg target"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.5"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            helperText="Used for the monthly progress bar"
            errorText={shown.target}
            required
          />
        </div>
        <Field
          id="bt-email"
          label="Contact email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          errorText={shown.email}
          required
        />
        <Field
          id="bt-phone"
          label="Contact phone (optional)"
          type="tel"
          inputMode="tel"
          prefix="+65"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          errorText={shown.phone}
          maxLength={9}
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
          >
            Save
          </Button>
        </SheetActions>
      </form>
    </Sheet>
  );
}
