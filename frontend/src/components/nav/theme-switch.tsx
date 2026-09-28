"use client";

import { Moon } from "@phosphor-icons/react/dist/ssr/Moon";
import { Sun } from "@phosphor-icons/react/dist/ssr/Sun";
import { cn } from "@/lib/cn";
import type { ThemePreference } from "@/lib/theme";

/**
 * Board "Theme switch · light / dark": a sun / moon pill in the top bar. The highlighted
 * half is the current mode; tapping anywhere on it switches. Icon-only below 768px
 * ("Compact · tablet / collapsed nav").
 */
export function ThemeSwitch({
  theme,
  onChange,
}: {
  theme: ThemePreference;
  onChange(next: ThemePreference): void;
}) {
  const dark = theme === "DARK";
  const hint = dark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <div className="group relative">
      <button
        type="button"
        role="switch"
        aria-checked={dark}
        aria-label="Dark mode"
        onClick={() => onChange(dark ? "LIGHT" : "DARK")}
        className={cn(
          "inline-flex h-11 shrink-0 items-center gap-0.5 rounded-full p-1 focus-visible:!outline-[#78AE58]",
          dark
            ? "bg-[rgba(243,240,230,0.08)] shadow-[inset_0_0_0_1px_rgba(243,240,230,0.16)] hover:shadow-[inset_0_0_0_1px_rgba(243,240,230,0.35)]"
            : "bg-beige shadow-[inset_0_0_0_1px_rgba(143,142,128,0.45)] hover:shadow-[inset_0_0_0_1px_#8F8E80]",
        )}
      >
        <Segment
          on={!dark}
          icon={<Sun size={18} weight={dark ? "regular" : "bold"} />}
        >
          Light
        </Segment>
        <Segment
          on={dark}
          icon={<Moon size={18} weight={dark ? "fill" : "regular"} />}
        >
          Dark
        </Segment>
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute right-0 top-[calc(100%+10px)] z-50 whitespace-nowrap rounded-[10px] bg-ink px-3 py-2 text-[13px] font-semibold leading-[18px] text-cream opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {hint} ·{" "}
        <span className="font-medium opacity-70">remembers your choice</span>
      </span>
    </div>
  );
}

function Segment({
  on,
  icon,
  children,
}: {
  on: boolean;
  icon: React.ReactNode;
  children: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center gap-1.5 rounded-[18px] text-[14px] transition-colors md:w-auto md:pl-2.5 md:pr-3",
        on
          ? // Active half: white pill in light mode, pale-leaf pill in dark mode.
            "bg-white font-bold text-[#2F4A24] shadow-[0_1px_2px_rgba(20,32,16,0.12),0_2px_6px_rgba(20,32,16,0.10)] dark:bg-[#BFE0A4] dark:text-[#10150D] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_0_0_1px_rgba(191,224,164,0.3)]"
          : "font-medium text-muted group-hover:text-ink",
      )}
    >
      <span
        aria-hidden
        className={cn("flex", on && "text-[#C98217] dark:text-[#10150D]")}
      >
        {icon}
      </span>
      <span className="sr-only md:not-sr-only">{children}</span>
    </span>
  );
}
