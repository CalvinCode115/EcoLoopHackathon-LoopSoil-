"use client";

import { Info } from "@phosphor-icons/react/dist/ssr/Info";
import { Lightbulb } from "@phosphor-icons/react/dist/ssr/Lightbulb";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { MAX_CLAIM_KG, MIN_CLAIM_KG } from "@/lib/constants";
import { formatKg } from "@/lib/format";

export type PickMode = "half" | "one" | "custom";

export interface PickValue {
  mode: PickMode;
  /** Raw text of the custom field. */
  custom: string;
}

/** What the current pick resolves to: a valid amount, or an error for the custom field. */
export function resolvePick(
  pick: PickValue,
  max: number,
): { amount: number; error: string } {
  if (pick.mode === "half") return { amount: 0.5, error: "" };
  if (pick.mode === "one") return { amount: 1, error: "" };
  const raw = pick.custom.trim();
  if (raw === "") return { amount: 0, error: "" };
  const v = Number(raw);
  if (Number.isNaN(v) || v < MIN_CLAIM_KG)
    return { amount: 0, error: `Minimum is ${MIN_CLAIM_KG}kg` };
  if (v > max + 1e-9)
    return { amount: 0, error: `You can request up to ${formatKg(max)}kg` };
  if (Math.abs(v * 10 - Math.round(v * 10)) > 1e-6)
    return { amount: 0, error: "Use steps of 0.1kg, like 0.3" };
  return { amount: v, error: "" };
}

/**
 * Amount picker (Taker components): quick picks "½ kg" / "1 kg" or "Custom" in 0.1kg
 * steps. The most a taker can ask for is `max` = min(allowance left, kg left in batch);
 * a chip over that is struck through and disabled, with a note saying why.
 */
export function AmountPicker({
  value,
  onChange,
  max,
  allowanceLeft,
  disabled = false,
}: {
  value: PickValue;
  onChange: (v: PickValue) => void;
  max: number;
  allowanceLeft: number;
  disabled?: boolean;
}) {
  const helpId = useId();
  const fieldId = useId();
  const halfDis = disabled || 0.5 > max + 1e-9;
  const oneDis = disabled || 1 > max + 1e-9;
  const { error } = resolvePick(value, max);

  // Why chips are unavailable — stock is the tighter limit, or the taker's allowance.
  let note = "";
  if (!disabled && oneDis) {
    const which = halfDis ? "“½ kg” and “1 kg” are" : "“1 kg” is";
    note =
      max < allowanceLeft - 1e-9
        ? `${which} unavailable: only ${formatKg(max)}kg left in this batch.`
        : `${which} unavailable: only ${formatKg(max)}kg of your allowance is left for this batch.`;
  }

  const chip = (mode: PickMode, label: string, isDisabled: boolean) => {
    const on = value.mode === mode && !isDisabled;
    return (
      <button
        type="button"
        aria-pressed={on}
        disabled={isDisabled}
        onClick={() => onChange({ ...value, mode })}
        className={cn(
          "h-[52px] flex-1 rounded-[14px] text-[17px] font-bold transition-colors",
          isDisabled
            ? "bg-disabled text-[#8A897E] line-through"
            : on
              ? "bg-leaf text-cream"
              : "bg-white text-ink shadow-[inset_0_0_0_1px_rgba(143,142,128,0.6)] hover:bg-sage",
        )}
      >
        {label}
      </button>
    );
  };

  return (
    <fieldset
      className="m-0 flex min-w-0 flex-col gap-3 border-none p-0"
      disabled={disabled}
    >
      <legend className="mb-3 p-0 text-body font-bold leading-6">
        Choose an amount
      </legend>
      <div role="group" aria-label="Quick pick" className="flex gap-2">
        {chip("half", "½ kg", halfDis)}
        {chip("one", "1 kg", oneDis)}
        {chip("custom", "Custom", disabled)}
      </div>
      <p id={helpId} className="flex items-start gap-2 text-small text-muted">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Minimum {MIN_CLAIM_KG}kg. Up to {MAX_CLAIM_KG}kg per person per batch.
        </span>
      </p>
      {note && (
        <p className="flex items-start gap-2 text-small font-semibold text-amber-ink">
          <WarningCircle
            size={16}
            weight="bold"
            className="mt-0.5 shrink-0"
            aria-hidden
          />
          <span>{note}</span>
        </p>
      )}

      {value.mode === "custom" && !disabled && (
        <div className="flex flex-col gap-2">
          <label htmlFor={fieldId} className="text-small font-semibold">
            Custom amount
          </label>
          <div
            className={cn(
              "flex items-center overflow-hidden rounded-control bg-white",
              error
                ? "shadow-[inset_0_0_0_2px_var(--color-error)]"
                : "shadow-[inset_0_0_0_2px_var(--color-leaf),0_0_0_4px_rgba(79,122,58,0.25)]",
            )}
          >
            <input
              id={fieldId}
              name="requestedKg"
              type="number"
              inputMode="decimal"
              min={MIN_CLAIM_KG}
              step={0.1}
              max={formatKg(max)}
              placeholder="e.g. 0.3"
              value={value.custom}
              onChange={(e) => onChange({ ...value, custom: e.target.value })}
              aria-invalid={error ? true : undefined}
              aria-describedby={helpId}
              autoFocus
              className="h-[52px] min-w-0 flex-1 border-none bg-transparent px-4 text-xl font-bold text-ink outline-none"
            />
            <span
              aria-hidden
              className="flex h-[52px] items-center bg-sage px-4 font-bold text-deep"
            >
              kg
            </span>
          </div>
          {error && (
            <p
              role="alert"
              className="flex items-start gap-1.5 text-small font-semibold text-error"
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
        </div>
      )}

      <p className="flex items-start gap-2 rounded-control bg-white px-3 py-2.5 text-small text-deep shadow-[inset_0_0_0_1px_rgba(143,142,128,0.3)]">
        <Lightbulb
          size={16}
          className="mt-0.5 shrink-0 text-leaf"
          aria-hidden
        />
        <span>Tip: 100–300g is usually enough to top up a potted plant.</span>
      </p>
    </fieldset>
  );
}
