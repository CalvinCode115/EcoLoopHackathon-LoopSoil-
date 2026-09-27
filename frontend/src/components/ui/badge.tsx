import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  BATCH_STATUS_LABEL,
  CLAIM_STATUS_LABEL,
  type BatchStatus,
  type ClaimStatus,
} from "@/lib/labels";

/**
 * Status badges. Colours differ in lightness as well as hue, and every badge carries its
 * text label, so status is never told by colour alone.
 */
export type BadgeTone =
  "amber" | "leaf" | "red" | "grey" | "deep" | "soil" | "sage";

const tones: Record<BadgeTone, string> = {
  amber: "bg-amber-tint text-amber-ink",
  leaf: "bg-leaf text-cream",
  red: "bg-danger-tint text-danger-ink",
  grey: "bg-grey-tint text-grey-ink",
  deep: "bg-deep text-cream",
  soil: "bg-transparent text-soil shadow-[inset_0_0_0_1.5px_var(--color-soil)]",
  sage: "bg-sage text-deep",
};

export function Badge({
  tone,
  icon,
  dot,
  size = "md",
  children,
  className,
}: {
  tone: BadgeTone;
  icon?: ReactNode;
  /** A 6px dot in the text colour instead of an icon. */
  dot?: boolean;
  /** md = 26px claim badges; sm = 24px batch/table badges. */
  size?: "md" | "sm";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 self-start whitespace-nowrap rounded-full px-2.5 font-bold",
        size === "md"
          ? "h-[26px] text-[13px] leading-4 tracking-[0.02em]"
          : "h-6 text-xs",
        tones[tone],
        className,
      )}
    >
      {icon}
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      <span>{children}</span>
    </span>
  );
}

const CLAIM_BADGE: Record<
  ClaimStatus,
  { tone: BadgeTone; icon?: ReactNode; dot?: boolean }
> = {
  PENDING: {
    tone: "amber",
    icon: <Clock size={14} weight="bold" aria-hidden />,
  },
  APPROVED: { tone: "leaf", dot: true },
  REJECTED: { tone: "red", icon: <X size={14} weight="bold" aria-hidden /> },
  CANCELLED: { tone: "grey", dot: true },
  COLLECTED: {
    tone: "deep",
    icon: <Check size={14} weight="bold" aria-hidden />,
  },
  NO_SHOW: { tone: "soil", dot: true },
};

/**
 * One badge per claim status. NO_SHOW is not a claim status in the backend — a no-show
 * shows on the booking — but the design treats it as a claim-card status, so it's here.
 */
export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  const b = CLAIM_BADGE[status];
  return (
    <Badge tone={b.tone} icon={b.icon} dot={b.dot}>
      {CLAIM_STATUS_LABEL[status]}
    </Badge>
  );
}

/** Booking statuses (Pickups drawer / day view): Booked uses the Approved look. */
export function BookingStatusBadge({
  status,
}: {
  status: "BOOKED" | "COLLECTED" | "NO_SHOW" | "CANCELLED";
}) {
  const key: ClaimStatus = status === "BOOKED" ? "APPROVED" : status;
  const b = CLAIM_BADGE[key];
  return (
    <Badge tone={b.tone} icon={b.icon} dot={b.dot}>
      {status === "BOOKED" ? "Booked" : CLAIM_STATUS_LABEL[key]}
    </Badge>
  );
}

const BATCH_TONE: Record<BatchStatus, BadgeTone> = {
  DRAFT: "grey",
  OPEN: "leaf",
  CLOSED: "amber",
  COMPLETED: "deep",
};

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  return (
    <Badge tone={BATCH_TONE[status]} size="sm">
      {BATCH_STATUS_LABEL[status]}
    </Badge>
  );
}
