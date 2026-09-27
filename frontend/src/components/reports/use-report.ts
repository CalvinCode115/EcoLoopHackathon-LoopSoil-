"use client";

import { api, type Paginated } from "@/lib/api";
import type { AnalyticsReport, Handover, ReportData } from "@/lib/types";
import { rangeBounds, useLoad } from "@/lib/use-load";
import { filterQuery, type ReportFilters } from "./report-model";

export interface ReportBundle {
  data: ReportData;
  analytics: AnalyticsReport;
  handovers: Handover[];
}

/**
 * Everything a Reports view shows for one filter state: the sections (/reporting/report),
 * KPIs + sparklines (/reporting/analytics) and the handover log (/handovers — up to 100
 * rows at pilot scale; taker type / category narrowed here since that list can't filter them).
 */
export function useReport(
  filters: ReportFilters,
  now: number,
  refresh: number,
) {
  const q = filterQuery(filters, now);
  const b = rangeBounds(filters.range, now, filters.custom);
  return useLoad<ReportBundle>(`${q}#${refresh}`, async () => {
    const logQ = new URLSearchParams({ pageSize: "100", to: b.to });
    if (b.from) logQ.set("from", b.from);
    if (filters.batchId) logQ.set("batchId", filters.batchId);
    const [data, analytics, log] = await Promise.all([
      api.get<ReportData>(`/reporting/report?${q}`),
      api.get<AnalyticsReport>(`/reporting/analytics?${q}`),
      api.get<Paginated<Handover>>(`/handovers?${logQ}`),
    ]);
    const handovers = log.data.filter(
      (h) =>
        (!filters.takerType || h.taker?.type === filters.takerType) &&
        (!filters.category || h.taker?.category === filters.category),
    );
    return { data, analytics, handovers };
  });
}
