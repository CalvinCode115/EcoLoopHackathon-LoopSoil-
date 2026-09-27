"use client";

import { ChartBar } from "@phosphor-icons/react/dist/ssr/ChartBar";
import { DownloadSimple } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import { Table } from "@phosphor-icons/react/dist/ssr/Table";
import { useState, type ReactNode } from "react";
import {
  DataTable,
  Panel,
  rowClass,
  tdClass,
} from "@/components/manager/panel";
import { ActionMenu } from "@/components/ui/action-menu";
import { downloadCsv, type CsvTable } from "./report-model";

/**
 * A Reports chart card (boards "Reports · chart menu / table view"): title + controls, and a
 * "⋯" menu to export the chart's data as CSV or swap the chart for an accessible table.
 * In print mode the menu is hidden.
 */
export function ChartCard({
  title,
  description,
  controls,
  data,
  children,
  print,
  className,
}: {
  title: string;
  description?: ReactNode;
  controls?: ReactNode;
  data?: CsvTable;
  children: ReactNode;
  print?: boolean;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Panel
      title={title}
      description={description}
      className={className}
      actions={
        print ? undefined : (
          <>
            {controls}
            {data && (
              <ActionMenu
                label={`More options for ${title}`}
                items={[
                  {
                    label: "Export data (CSV)",
                    icon: <DownloadSimple size={16} />,
                    onSelect: () => downloadCsv(data),
                  },
                  asTable
                    ? {
                        label: "Show chart",
                        icon: <ChartBar size={16} />,
                        onSelect: () => setAsTable(false),
                      }
                    : {
                        label: "View as table",
                        icon: <Table size={16} />,
                        onSelect: () => setAsTable(true),
                      },
                ]}
              />
            )}
          </>
        )
      }
    >
      {asTable && data ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">
            Showing as table ·{" "}
            <button
              type="button"
              onClick={() => setAsTable(false)}
              className="font-bold text-deep underline"
            >
              Show chart
            </button>
          </p>
          <DataTable head={data.header}>
            {data.rows.map((r, i) => (
              <tr key={i} className={rowClass}>
                {r.map((c, j) => (
                  <td key={j} className={tdClass}>
                    {c ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </DataTable>
        </div>
      ) : (
        children
      )}
    </Panel>
  );
}

/** Small segmented control used in chart headers (granularity, recipient type). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-control bg-[#ECE6D8] p-[3px]"
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={
            value === o.key
              ? "h-8 rounded-[9px] bg-cream px-3 text-[13px] font-bold text-deep shadow-card"
              : "h-8 rounded-[9px] px-3 text-[13px] font-medium hover:bg-sage"
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Section heading with the anchor the section nav scrolls to. */
export function SectionHead({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div id={id} className="scroll-mt-40 pt-2">
      <h2 className="font-display m-0 text-2xl font-semibold leading-8 text-deep">
        {title}
      </h2>
      <p className="text-small text-muted">{description}</p>
    </div>
  );
}

/** Plain stat tile (Pickups / Takers / Response time headers). */
export function StatTile({
  label,
  value,
  sub,
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-card bg-cream p-[18px] shadow-card">
      <span className="text-[13px] font-bold text-muted">{label}</span>
      <span className="font-display text-[30px] font-semibold leading-9 text-deep">
        {value}
      </span>
      {sub && <span className="text-[13px] text-muted">{sub}</span>}
      {children}
    </div>
  );
}
