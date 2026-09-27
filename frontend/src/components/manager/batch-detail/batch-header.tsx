import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { Drop } from "@phosphor-icons/react/dist/ssr/Drop";
import { Lock } from "@phosphor-icons/react/dist/ssr/Lock";
import { MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr/PaperPlaneTilt";
import { PencilSimple } from "@phosphor-icons/react/dist/ssr/PencilSimple";
import { PlusCircle } from "@phosphor-icons/react/dist/ssr/PlusCircle";
import { StopCircle } from "@phosphor-icons/react/dist/ssr/StopCircle";
import { Trash } from "@phosphor-icons/react/dist/ssr/Trash";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Chip } from "@/components/manager/panel";
import { ActionMenu } from "@/components/ui/action-menu";
import { BatchStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDayMonth, formatFullDate } from "@/lib/format";
import type { Batch } from "@/lib/types";

/**
 * Batch header (board "Header actions by status"): Draft → Edit, Publish · Open → Top up
 * stock, Close claiming · Closed → Mark completed · Completed → view only.
 */
export function BatchHeader({
  batch,
  publishing,
  onEdit,
  onPublish,
  onTopUp,
  onClose,
  onComplete,
  onDelete,
  deleteBlockedReason,
}: {
  batch: Batch;
  publishing: boolean;
  onEdit: () => void;
  onPublish: () => void;
  onTopUp: () => void;
  onClose: () => void;
  onComplete: () => void;
  onDelete: () => void;
  /** Why "Delete batch" is greyed out (in use / completed), or null when it is allowed. */
  deleteBlockedReason: string | null;
}) {
  const meta: ReactNode[] = [
    <span key="h" className="inline-flex items-center gap-1.5">
      <CalendarBlank size={16} aria-hidden />
      Harvested {formatFullDate(batch.harvestDate)}
    </span>,
    batch.phReading != null && (
      <Chip
        key="ph"
        tone="soil"
        icon={<Drop size={14} weight="bold" aria-hidden />}
      >
        pH {batch.phReading}
      </Chip>
    ),
    batch.pickupLocation && (
      <span key="l" className="inline-flex items-center gap-1.5">
        <MapPin size={16} aria-hidden />
        {batch.pickupLocation}
      </span>
    ),
    (batch.availableFrom || batch.availableUntil) && (
      <span key="w" className="inline-flex items-center gap-1.5">
        <Clock size={16} aria-hidden />
        Claim window{" "}
        {batch.availableFrom
          ? formatDayMonth(batch.availableFrom)
          : "now"} –{" "}
        {batch.availableUntil
          ? formatDayMonth(batch.availableUntil)
          : "open-ended"}
      </span>
    ),
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="flex min-w-0 flex-col gap-2.5">
        <Link
          href="/manager/batches"
          className="inline-flex items-center gap-1 self-start text-small font-semibold text-deep no-underline"
        >
          <CaretLeft size={16} weight="bold" aria-hidden />
          Batches
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="font-display m-0 text-[34px] font-semibold leading-[42px] text-deep">
            {batch.reference}
          </h1>
          <BatchStatusBadge status={batch.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-small text-muted">
          {meta.map((m, i) => (
            <Fragment key={i}>
              {i > 0 && <span aria-hidden>·</span>}
              {m}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 md:pt-[30px]">
        {batch.status === "DRAFT" && (
          <>
            <Button
              variant="secondary"
              size="sm"
              className="px-[18px]"
              icon={<PencilSimple size={18} />}
              onClick={onEdit}
            >
              Edit
            </Button>
            <Button
              size="sm"
              className="px-[18px]"
              icon={<PaperPlaneTilt size={18} />}
              loading={publishing}
              onClick={onPublish}
            >
              Publish
            </Button>
          </>
        )}
        {batch.status === "OPEN" && (
          <>
            <Button
              variant="secondary"
              size="sm"
              className="px-[18px]"
              icon={<PlusCircle size={18} />}
              onClick={onTopUp}
            >
              Top up stock
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="px-[18px]"
              icon={<StopCircle size={18} />}
              onClick={onClose}
            >
              Close claiming
            </Button>
          </>
        )}
        {batch.status === "CLOSED" && (
          <Button
            size="sm"
            className="px-[18px]"
            icon={<CheckCircle size={18} />}
            onClick={onComplete}
          >
            Mark completed
          </Button>
        )}
        {batch.status === "COMPLETED" && (
          <Chip tone="grey" icon={<Lock size={14} weight="bold" aria-hidden />}>
            View only · batch completed
          </Chip>
        )}
        <ActionMenu
          label={`More actions for ${batch.reference}`}
          items={[
            deleteBlockedReason
              ? {
                  label: "Delete batch",
                  icon: <Trash size={16} />,
                  disabledReason: deleteBlockedReason,
                }
              : {
                  label: "Delete batch",
                  icon: <Trash size={16} />,
                  onSelect: onDelete,
                  danger: true,
                },
          ]}
        />
      </div>
    </div>
  );
}
