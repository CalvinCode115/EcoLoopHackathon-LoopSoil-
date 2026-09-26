import type { InputHTMLAttributes, ReactNode } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
  /** Present in the markup even when empty, per the shared form pattern. */
  helperText?: string;
  errorText?: string;
}

/** Label above input, helper below, error below in that same slot. No placeholder-as-label. */
export function Field({
  label,
  icon,
  helperText,
  errorText,
  id,
  className = "",
  ...inputProps
}: FieldProps) {
  const fieldId = id ?? inputProps.name;
  const describedBy = errorText
    ? `${fieldId}-error`
    : helperText
      ? `${fieldId}-helper`
      : undefined;

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={fieldId}
        className="font-body text-sm font-medium text-ink"
      >
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint">
            {icon}
          </span>
        )}
        <input
          id={fieldId}
          className={`w-full rounded-xl border bg-canvas-raised px-4 py-3 font-body text-[0.95rem] text-ink
            placeholder:text-ink-faint transition-colors duration-150
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest-500
            ${icon ? "pl-11" : ""}
            ${errorText ? "border-red-600" : "border-line-strong focus:border-forest-500"}
            ${className}`}
          aria-invalid={!!errorText}
          aria-describedby={describedBy}
          {...inputProps}
        />
      </div>
      {errorText ? (
        <p
          id={`${fieldId}-error`}
          role="alert"
          className="font-body text-sm text-red-700"
        >
          {errorText}
        </p>
      ) : helperText ? (
        <p
          id={`${fieldId}-helper`}
          className="font-body text-sm text-ink-faint"
        >
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
