"use client";

import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { Info } from "@phosphor-icons/react/dist/ssr/Info";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { FormErrorBanner } from "@/components/auth/auth-layout";
import { useManagerCrumbs } from "@/components/nav/manager-shell";
import { STOCK_COLORS } from "@/components/manager/stock-bar";
import { Button } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";
import { ApiError, api, type Paginated } from "@/lib/api";
import {
  addDays,
  batchPayload,
  validateBatchForm,
  type BatchFormErrors,
} from "@/lib/batch-form";
import { formatDayMonth, formatKg, sgDayKey } from "@/lib/format";
import { friendlyError } from "@/lib/labels";
import type { Batch } from "@/lib/types";

const DEFAULT_LOCATION = "SUSS bin centre";
const CLAIM_WINDOW_DAYS = 13;
const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{1,39}$/;

type Errors = BatchFormErrors;

/**
 * Manager · Log new batch (/manager/batches/new) — boards "New batch" and "New batch ·
 * validation errors". Form + sticky live preview of the public pool. Save as draft =
 * POST /batches; Publish = POST /batches then POST /batches/:id/publish. The reference is
 * suggested the same way the backend generates it (harvest month + next free letter); if
 * left untouched it is omitted so the backend picks it.
 */
export default function NewBatchPage() {
  useManagerCrumbs([
    { label: "Batches", href: "/manager/batches" },
    { label: "Log new batch" },
  ]);
  const router = useRouter();

  const [today] = useState(() => sgDayKey(new Date().toISOString()));
  const [existingRefs, setExistingRefs] = useState<string[]>([]);
  const [reference, setReference] = useState("");
  const [refTouched, setRefTouched] = useState(false);
  const [harvest, setHarvest] = useState(today);
  const [total, setTotal] = useState("");
  const [reserve, setReserve] = useState("");
  const [ph, setPh] = useState("");
  const [from, setFrom] = useState(today);
  const [until, setUntil] = useState(() => addDays(today, CLAIM_WINDOW_DAYS));
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [notes, setNotes] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Paginated<Batch>>("/batches?pageSize=100")
      .then(
        (page) =>
          !cancelled && setExistingRefs(page.data.map((b) => b.reference)),
      )
      .catch(() => {
        // Suggestion only — the backend still auto-generates if this fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const suggested = harvest ? suggestReference(harvest, existingRefs) : "";
  const shownRef = refTouched ? reference : suggested;

  const totalKg = Number(total);
  const reserveKg = reserve === "" ? 0 : Number(reserve);
  const values = { harvest, total, reserve, ph, from, until, location, notes };
  const errors: Errors = validateBatchForm(values);
  if (refTouched && !REFERENCE_PATTERN.test(reference.trim()))
    errors.reference = "Use 2–40 letters, digits or hyphens, e.g. 2026-10-B";

  const shown: Errors = attempted
    ? { ...errors, ...serverErrors }
    : serverErrors;
  const errorCount = Object.values(shown).filter(Boolean).length;
  const poolValid = totalKg > 0 && reserveKg >= 0 && reserveKg <= totalKg;
  const publicKg = poolValid ? totalKg - reserveKg : null;

  async function save(mode: "draft" | "publish", e?: FormEvent) {
    e?.preventDefault();
    setAttempted(true);
    setServerErrors({});
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSaving(mode);
    let created: Batch | null = null;
    try {
      created = await api.post<Batch>("/batches", {
        reference: refTouched ? reference.trim() : undefined,
        ...batchPayload(values),
      });
      if (mode === "publish") await api.post(`/batches/${created.id}/publish`);
      router.push(
        `/manager/batches/${created.id}?${mode === "publish" ? "published" : "saved"}=1`,
      );
    } catch (err) {
      setSaving(null);
      if (created) {
        // Saved, but publishing failed — the draft exists, so go to it rather than retry-create.
        router.push(`/manager/batches/${created.id}?publishFailed=1`);
        return;
      }
      if (err instanceof ApiError && err.code === "REFERENCE_TAKEN") {
        setRefTouched(true);
        setReference(shownRef);
        setServerErrors({
          reference: "That reference is already in use. Try the next letter.",
        });
      } else {
        setFormError(friendlyError(err));
      }
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1.5">
        <Link
          href="/manager/batches"
          className="inline-flex items-center gap-1 text-small font-semibold text-deep no-underline"
        >
          <CaretLeft size={16} weight="bold" aria-hidden />
          Batches
        </Link>
        <h1 className="font-display m-0 text-[32px] font-semibold leading-10 text-deep">
          Log new batch
        </h1>
        <p className="text-[15px] leading-[23px] text-muted">
          Record a harvest. Save as a draft or publish it to takers.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
        <form
          noValidate
          onSubmit={(e) => void save("publish", e)}
          className="flex min-w-0 flex-col gap-6 rounded-card bg-cream p-5 shadow-card md:p-7"
        >
          {errorCount > 0 && (
            <FormErrorBanner>
              {errorCount === 1
                ? "1 thing to fix before saving"
                : `${errorCount} things to fix before saving`}
            </FormErrorBanner>
          )}
          {formError && <FormErrorBanner>{formError}</FormErrorBanner>}

          <Fieldset title="Batch details">
            <Row>
              <Field
                id="b-ref"
                label="Reference"
                value={shownRef}
                onChange={(e) => {
                  setRefTouched(true);
                  setReference(e.target.value);
                }}
                helperText="Auto-generated. You can edit it."
                errorText={shown.reference}
                required
              />
              <Field
                id="b-harvest"
                label="Harvest date"
                type="date"
                value={harvest}
                onChange={(e) => setHarvest(e.target.value)}
                errorText={shown.harvest}
                required
              />
            </Row>
            <Row>
              <Field
                id="b-total"
                label="Total kg"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                helperText="Weighed at the bin centre"
                errorText={shown.total}
                required
              />
              <Field
                id="b-reserve"
                label="School reserve kg"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                value={reserve}
                onChange={(e) => setReserve(e.target.value)}
                helperText="Set aside for the SUSS rooftop garden"
                errorText={shown.reserve}
                required
              />
            </Row>
            <Row>
              <Field
                id="b-ph"
                label="pH reading (optional)"
                type="number"
                inputMode="decimal"
                min={0}
                max={14}
                step="0.1"
                placeholder="e.g. 6.8"
                value={ph}
                onChange={(e) => setPh(e.target.value)}
                helperText="Most finished compost reads 6.0–8.0"
                errorText={shown.ph}
              />
            </Row>
          </Fieldset>

          <Divider />

          <Fieldset
            title="Claim window"
            description="When takers can see and claim this batch."
          >
            <Row>
              <Field
                id="b-from"
                label="Available from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                errorText={shown.from}
                required
              />
              <Field
                id="b-until"
                label="Until"
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                helperText="Takers can claim until the end of this day"
                errorText={shown.until}
                required
              />
            </Row>
          </Fieldset>

          <Divider />

          <Fieldset title="Pickup">
            <Field
              id="b-loc"
              label="Pickup location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              helperText="Default location. Change it for one-off pickups."
              maxLength={200}
            />
            <TextAreaField
              id="b-notes"
              label="Notes (optional)"
              rows={3}
              placeholder="Anything takers or staff should know"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
            />
          </Fieldset>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-5 shadow-[inset_0_1px_0_rgba(107,107,94,0.14)]">
            <Link
              href="/manager/batches"
              className="text-[15px] font-bold text-deep"
            >
              Cancel
            </Link>
            <div className="flex gap-2.5">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="px-5"
                loading={saving === "draft"}
                disabled={saving !== null}
                onClick={() => void save("draft")}
              >
                Save as draft
              </Button>
              <Button
                type="submit"
                size="md"
                loading={saving === "publish"}
                disabled={saving !== null}
              >
                Publish
              </Button>
            </div>
          </div>
        </form>

        <LivePreview
          reference={shownRef || "—"}
          totalKg={poolValid ? totalKg : null}
          reserveKg={poolValid ? reserveKg : null}
          publicKg={publicKg}
          from={from}
          until={until}
          location={location.trim() || DEFAULT_LOCATION}
          ph={ph}
        />
      </div>
    </div>
  );
}

function LivePreview({
  reference,
  totalKg,
  reserveKg,
  publicKg,
  from,
  until,
  location,
  ph,
}: {
  reference: string;
  totalKg: number | null;
  reserveKg: number | null;
  publicKg: number | null;
  from: string;
  until: string;
  location: string;
  ph: string;
}) {
  const valid = publicKg !== null && totalKg !== null && reserveKg !== null;
  const windowText =
    from && until ? `${formatDayMonth(from)} – ${formatDayMonth(until)}` : "—";
  const meta = [`Claim ${windowText}`, location, ph !== "" ? `pH ${ph}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      aria-labelledby="preview-title"
      className="flex min-w-0 flex-col gap-4 rounded-card bg-cream p-5 shadow-card lg:sticky lg:top-[100px]"
    >
      <h2
        id="preview-title"
        className="font-display m-0 text-lg font-semibold leading-[26px] text-deep"
      >
        Live preview
      </h2>
      <div aria-live="polite" className="flex flex-col gap-1">
        <span className="text-[13px] font-bold text-muted">Public pool</span>
        <span className="font-display text-[40px] font-semibold leading-[44px] text-deep">
          {valid ? `${formatKg(publicKg)} kg` : "— kg"}
        </span>
        <span className="text-[13px] text-muted">
          {valid
            ? `${formatKg(totalKg)}kg total − ${formatKg(reserveKg)}kg school reserve`
            : "Fix total and reserve to see the public pool."}
        </span>
      </div>

      <div
        role="img"
        aria-label={
          valid
            ? `${formatKg(reserveKg)}kg school reserve, ${formatKg(publicKg)}kg public pool`
            : "No stock yet"
        }
        className="flex h-3.5 gap-0.5 overflow-hidden rounded-[7px] bg-[#ECE6D8]"
      >
        {valid && reserveKg > 0 && (
          <span style={{ flex: reserveKg, background: STOCK_COLORS.reserve }} />
        )}
        {valid && publicKg > 0 && (
          <span
            style={{ flex: publicKg, background: STOCK_COLORS.remaining }}
          />
        )}
      </div>
      <ul
        aria-label="Legend"
        className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0"
      >
        <LegendItem color={STOCK_COLORS.reserve}>School reserve</LegendItem>
        <LegendItem color={STOCK_COLORS.remaining}>Public pool</LegendItem>
      </ul>

      <div>
        <PreviewRow
          label="Total"
          value={valid ? `${formatKg(totalKg)}kg` : "0kg"}
        />
        <PreviewRow
          label="School reserve"
          value={valid ? `−${formatKg(reserveKg)}kg` : "—"}
        />
        <PreviewRow
          label="Public pool"
          value={valid ? `${formatKg(publicKg)}kg` : "—"}
          strong
        />
      </div>

      <div className="flex flex-col gap-2 rounded-control bg-white p-3.5 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-muted">
          Takers will see
        </span>
        <strong className="text-[15px]">
          Batch {reference} · {valid ? `${formatKg(publicKg)}kg` : "—"}{" "}
          available
        </strong>
        <span className="text-[13px] text-muted">{meta}</span>
      </div>

      <p className="flex gap-2 text-[13px] leading-[19px] text-muted">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        Bulk allocations come out of the public pool after you publish.
      </p>
    </section>
  );
}

function Fieldset({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-4 border-none p-0">
      <legend className="mb-1 p-0">
        <span className="font-display block text-lg font-semibold leading-[26px] text-deep">
          {title}
        </span>
        {description && (
          <span className="block text-[13px] leading-[21px] text-muted">
            {description}
          </span>
        )}
      </legend>
      {children}
    </fieldset>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div className="grid items-start gap-4 sm:grid-cols-2">{children}</div>
  );
}

function Divider() {
  return <div aria-hidden className="h-px bg-[rgba(107,107,94,0.14)]" />;
}

function LegendItem({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-1.5 text-[13px] text-ink">
      <span
        aria-hidden
        className="size-3 rounded-[3px]"
        style={{ background: color }}
      />
      {children}
    </li>
  );
}

function PreviewRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between py-2 text-small shadow-[inset_0_-1px_0_rgba(107,107,94,0.14)] ${strong ? "font-bold" : ""}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** Mirrors the backend's generator: "YYYY-MM-" + first unused A, B … Z, AA … */
function suggestReference(harvestDay: string, existing: string[]): string {
  const prefix = `${harvestDay.slice(0, 7)}-`;
  const used = new Set(
    existing
      .filter((r) => r.startsWith(prefix))
      .map((r) => r.slice(prefix.length)),
  );
  for (let i = 0; ; i++) {
    let n = i + 1;
    let suffix = "";
    while (n > 0) {
      suffix = String.fromCharCode(65 + ((n - 1) % 26)) + suffix;
      n = Math.floor((n - 1) / 26);
    }
    if (!used.has(suffix)) return prefix + suffix;
  }
}
