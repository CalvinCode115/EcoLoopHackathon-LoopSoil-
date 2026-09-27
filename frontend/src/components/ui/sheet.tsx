"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Modal sheet: slides up from the bottom on phones (grab handle, rounded top), a centred
 * dialog from 768px. Dark scrim closes it; Esc closes it; focus moves into the sheet and
 * returns on close; the page behind doesn't scroll.
 */
export function Sheet({
  labelledBy,
  onClose,
  children,
  className,
}: {
  /** id of the sheet's heading. */
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
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

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center md:p-6">
      <div
        aria-hidden
        className="absolute inset-0 bg-[rgba(28,36,22,0.5)]"
        onClick={onClose}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-3xl bg-cream px-5 pb-6 pt-3 shadow-photo outline-none md:max-w-[480px] md:rounded-3xl md:p-7",
          className,
        )}
      >
        <span
          aria-hidden
          className="h-1 w-10 shrink-0 self-center rounded-sm bg-[#CFC9BA] md:hidden"
        />
        {children}
      </div>
    </div>
  );
}
