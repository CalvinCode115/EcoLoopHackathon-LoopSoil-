"use client";

import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { Eye } from "@phosphor-icons/react/dist/ssr/Eye";
import { EyeSlash } from "@phosphor-icons/react/dist/ssr/EyeSlash";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

/**
 * Input from the design system: label above, 48px white field, 12px radius, 1px hairline
 * (#8F8E80, 3:1). Focus: 2px leaf ring + halo. Error: red ring + red helper with icon.
 * Helper and error share the slot under the field. Never placeholder-as-label.
 */
const fieldBox =
  "flex items-center overflow-hidden rounded-control bg-white shadow-[inset_0_0_0_1px_var(--color-edge)] " +
  "focus-within:shadow-[inset_0_0_0_2px_var(--color-leaf),0_0_0_4px_rgba(79,122,58,0.25)]";
const fieldBoxError =
  "shadow-[inset_0_0_0_2px_var(--color-error)] focus-within:shadow-[inset_0_0_0_2px_var(--color-error),0_0_0_4px_rgba(180,67,47,0.2)]";
const control =
  "min-w-0 flex-1 border-none bg-transparent px-4 font-sans text-body text-ink outline-none " +
  "placeholder:text-muted disabled:cursor-not-allowed";

interface SlotProps {
  label: string;
  helperText?: ReactNode;
  errorText?: ReactNode;
}

function Label({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="text-small font-semibold text-ink">
      {children}
    </label>
  );
}

function Message({
  id,
  helperText,
  errorText,
  indent = false,
}: { id: string; indent?: boolean } & Omit<SlotProps, "label">) {
  if (errorText) {
    return (
      <p
        id={id}
        role="alert"
        className={cn(
          "flex items-start gap-1.5 text-small font-medium text-error",
          indent && "pl-8",
        )}
      >
        <WarningCircle
          size={16}
          weight="bold"
          className="mt-0.5 shrink-0"
          aria-hidden
        />
        <span>{errorText}</span>
      </p>
    );
  }
  if (helperText) {
    return (
      <p id={id} className="text-small text-muted">
        {helperText}
      </p>
    );
  }
  return null;
}

export interface FieldProps
  extends SlotProps, InputHTMLAttributes<HTMLInputElement> {
  /** Fixed text before the value, e.g. "+65" for phone numbers. */
  prefix?: string;
  /** Text after the value, e.g. "kg". */
  suffix?: string;
  /**
   * Red ring without a message of its own — for form-level errors shown in a banner
   * (e.g. "Incorrect email or password" rings both fields).
   */
  invalid?: boolean;
}

export function Field({
  label,
  helperText,
  errorText,
  prefix,
  suffix,
  invalid,
  id,
  type = "text",
  disabled,
  className,
  ...input
}: FieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const messageId = `${fieldId}-msg`;
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={fieldId}>{label}</Label>
      <div
        className={cn(
          fieldBox,
          errorText || invalid ? fieldBoxError : false,
          disabled && "bg-disabled",
        )}
      >
        {prefix && (
          <span
            aria-hidden
            className="flex h-12 items-center rounded-l-control bg-sage pl-4 pr-3 text-body font-semibold text-deep"
          >
            {prefix}
          </span>
        )}
        <input
          id={fieldId}
          type={isPassword && revealed ? "text" : type}
          disabled={disabled}
          aria-invalid={errorText || invalid ? true : undefined}
          aria-describedby={errorText || helperText ? messageId : undefined}
          className={cn(control, "h-12")}
          {...input}
        />
        {suffix && <span className="pr-4 text-body text-muted">{suffix}</span>}
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            className="mr-1 flex size-11 items-center justify-center rounded-control text-muted hover:bg-sage hover:text-deep"
          >
            {revealed ? <EyeSlash size={20} /> : <Eye size={20} />}
          </button>
        )}
      </div>
      <Message id={messageId} helperText={helperText} errorText={errorText} />
    </div>
  );
}

export interface TextAreaFieldProps
  extends SlotProps, TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function TextAreaField({
  label,
  helperText,
  errorText,
  id,
  rows = 4,
  className,
  ...textarea
}: TextAreaFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const messageId = `${fieldId}-msg`;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={fieldId}>{label}</Label>
      <div className={cn(fieldBox, errorText ? fieldBoxError : false)}>
        <textarea
          id={fieldId}
          rows={rows}
          aria-invalid={errorText ? true : undefined}
          aria-describedby={errorText || helperText ? messageId : undefined}
          className={cn(control, "resize-y py-3")}
          {...textarea}
        />
      </div>
      <Message id={messageId} helperText={helperText} errorText={errorText} />
    </div>
  );
}

export interface SelectFieldProps
  extends SlotProps, SelectHTMLAttributes<HTMLSelectElement> {}

/** Native select in the Input shell, with a caret (Add allocation → "Bulk taker"). */
export function SelectField({
  label,
  helperText,
  errorText,
  id,
  className,
  children,
  ...select
}: SelectFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const messageId = `${fieldId}-msg`;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={fieldId}>{label}</Label>
      <div
        className={cn(fieldBox, "relative", errorText ? fieldBoxError : false)}
      >
        <select
          id={fieldId}
          aria-invalid={errorText ? true : undefined}
          aria-describedby={errorText || helperText ? messageId : undefined}
          className={cn(control, "h-12 cursor-pointer appearance-none pr-10")}
          {...select}
        >
          {children}
        </select>
        <CaretDown
          size={18}
          aria-hidden
          className="pointer-events-none absolute right-3.5 text-muted"
        />
      </div>
      <Message id={messageId} helperText={helperText} errorText={errorText} />
    </div>
  );
}

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  label: ReactNode;
  errorText?: ReactNode;
}

/** 20px box inside a 44px-tall label so the whole row is tappable. */
export function Checkbox({
  label,
  errorText,
  id,
  className,
  ...input
}: CheckboxProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const messageId = `${fieldId}-msg`;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label
        htmlFor={fieldId}
        className="flex min-h-11 cursor-pointer items-start gap-3 pt-2.5 text-small text-ink"
      >
        <input
          id={fieldId}
          type="checkbox"
          aria-invalid={errorText ? true : undefined}
          aria-describedby={errorText ? messageId : undefined}
          className={cn(
            "m-0 size-5 shrink-0 cursor-pointer accent-leaf",
            errorText ? "rounded shadow-[0_0_0_2px_var(--color-error)]" : false,
          )}
          {...input}
        />
        <span>{label}</span>
      </label>
      <Message id={messageId} errorText={errorText} indent />
    </div>
  );
}
