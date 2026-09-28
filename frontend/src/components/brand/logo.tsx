import { Image as ImageIcon } from "@phosphor-icons/react/dist/ssr/Image";
import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * The design ships the logos as labelled dashed placeholders ("[LoopSoil logo]",
 * "[SUSS logo]"). The SUSS logo is now the real artwork (SussLogo); the LoopSoil logo is
 * still being designed, so it stays a placeholder slot — swap LogoSlot for <Image> in
 * LoopSoilLogo once the file arrives. The sizes here are the design's slots.
 */
function LogoSlot({
  label,
  className,
  onDark,
  onNav,
}: {
  label: string;
  className?: string;
  onDark?: boolean;
  /** On the manager's green sidebar: fixed pale sage, the same in light and dark mode. */
  onNav?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] text-xs font-semibold outline-[1.5px] -outline-offset-[1.5px] outline-dashed",
        onNav
          ? "bg-[#DCE5CF] text-[#2F4A24] outline-[rgba(47,74,36,0.35)]"
          : onDark
            ? "bg-cream/12 text-cream outline-cream/45"
            : "bg-sage text-deep outline-deep/35",
        className,
      )}
    >
      <ImageIcon size={14} weight="bold" aria-hidden />
      <span>[{label}]</span>
    </span>
  );
}

export function LoopSoilLogo({
  className,
  onDark,
  onNav,
}: {
  className?: string;
  onDark?: boolean;
  onNav?: boolean;
}) {
  return (
    <LogoSlot
      label="LoopSoil logo"
      className={cn("w-[120px]", className)}
      onDark={onDark}
      onNav={onNav}
    />
  );
}

/**
 * The SUSS logo (navy + red on transparent, public/images/brand/suss-logo.png, 1200×641).
 * Height is set by `className` (default h-10); width follows the aspect ratio. Needs a light
 * background — the navy disappears on the dark-green footer or dark mode.
 */
export function SussLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/images/brand/suss-logo.png"
      alt="SUSS — Singapore University of Social Sciences"
      width={1200}
      height={641}
      className={cn("w-auto shrink-0", className ?? "h-10")}
    />
  );
}

/** "[LoopSoil logo] × SUSS logo". `compact` = the mobile lockup. */
export function LogoLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <LogoSlot
        label={compact ? "LoopSoil" : "LoopSoil logo"}
        className={compact ? "w-24" : "w-[120px]"}
      />
      <span aria-hidden className="text-lg font-medium text-muted">
        ×
      </span>
      <SussLogo className={compact ? "h-8" : "h-10"} />
    </span>
  );
}
