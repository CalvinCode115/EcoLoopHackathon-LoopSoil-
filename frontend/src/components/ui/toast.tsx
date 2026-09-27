"use client";

import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { useEffect } from "react";
import { cn } from "@/lib/cn";

/**
 * Toast (taker/manager kits): a pill floating under the top bar. Success is deep green,
 * error is dark red. Auto-dismisses after `duration` ms (errors stay until dismissed or
 * replaced when duration is 0).
 */
export function Toast({
  tone,
  children,
  onDismiss,
  duration = 4000,
}: {
  tone: "success" | "error";
  children: React.ReactNode;
  onDismiss: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!duration) return;
    const id = setTimeout(onDismiss, duration);
    return () => clearTimeout(id);
  }, [duration, onDismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-4 top-[76px] z-[45] flex justify-center md:top-[88px]">
      <div
        role={tone === "error" ? "alert" : "status"}
        className={cn(
          "pointer-events-auto flex w-full max-w-[440px] items-center gap-3 rounded-[14px] px-4 py-3 text-small font-semibold text-cream shadow-photo",
          tone === "success" ? "bg-deep" : "bg-danger-ink",
        )}
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full",
            tone === "success" ? "bg-leaf" : "bg-cream/18",
          )}
        >
          {tone === "success" ? (
            <Check size={16} weight="bold" aria-hidden />
          ) : (
            <WarningCircle size={16} weight="bold" aria-hidden />
          )}
        </span>
        <span className="flex-1">{children}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 flex size-8 items-center justify-center rounded-full text-cream/80 hover:bg-cream/15 hover:text-cream"
        >
          ×
        </button>
      </div>
    </div>
  );
}
