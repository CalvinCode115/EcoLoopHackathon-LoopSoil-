import { Image as ImageIcon } from "@phosphor-icons/react/dist/ssr/Image";
import { cn } from "@/lib/cn";

/**
 * The design ships the logos as labelled dashed placeholders ("[LoopSoil logo]",
 * "[SUSS logo]") — no artwork exists yet. Swap the inner markup for <Image> once the
 * real files are supplied; the sizes here are the design's slots.
 */
function LogoSlot({
  label,
  className,
  onDark,
}: {
  label: string;
  className?: string;
  onDark?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] text-xs font-semibold outline-[1.5px] -outline-offset-[1.5px] outline-dashed",
        onDark
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
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <LogoSlot
      label="LoopSoil logo"
      className={cn("w-[120px]", className)}
      onDark={onDark}
    />
  );
}

/** "[LoopSoil logo] × [SUSS logo]". `compact` = the mobile lockup. */
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
      <LogoSlot
        label={compact ? "SUSS" : "SUSS logo"}
        className={compact ? "w-16" : "w-[104px]"}
      />
    </span>
  );
}
