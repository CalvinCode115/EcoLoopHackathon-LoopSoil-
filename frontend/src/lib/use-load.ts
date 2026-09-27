"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays } from "@/lib/batch-form";
import { sgDayKey } from "@/lib/format";

export type LoadState<T> =
  | { status: "loading"; data?: undefined }
  | { status: "error"; data?: undefined }
  | { status: "ready"; data: T };

/**
 * One widget's data: loads on mount and whenever `key` changes, keeps showing the last
 * data while reloading, and exposes `reload` (the "Couldn't load this · Retry" boards).
 */
export function useLoad<T>(
  key: string,
  fetcher: () => Promise<T>,
): LoadState<T> & { reload: () => void } {
  const [state, setState] = useState<{ key: string; value: LoadState<T> }>({
    key,
    value: { status: "loading" },
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetcher().then(
      (data) =>
        !cancelled && setState({ key, value: { status: "ready", data } }),
      () => !cancelled && setState({ key, value: { status: "error" } }),
    );
    return () => {
      cancelled = true;
    };
    // `key` stands for the fetcher's inputs; the fetcher identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  // A new key shows the loading state until its data arrives.
  const value: LoadState<T> =
    state.key === key ? state.value : { status: "loading" };
  return { ...value, reload } as LoadState<T> & { reload: () => void };
}

export type RangePreset =
  "week" | "month" | "3months" | "year" | "all" | "custom";

/** Singapore calendar-day bounds for a range preset (to = now for "to date" ranges). */
export function rangeBounds(
  preset: RangePreset,
  now: number,
  custom?: { from: string; to: string },
): { from: string | null; to: string } {
  const today = sgDayKey(new Date(now).toISOString());
  const toIso = new Date(now).toISOString();
  const midnight = (day: string) =>
    new Date(`${day}T00:00:00+08:00`).toISOString();
  switch (preset) {
    case "week": {
      const [y, m, d] = today.split("-").map(Number);
      const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
      return { from: midnight(addDays(today, -dow)), to: toIso };
    }
    case "month":
      return { from: midnight(`${today.slice(0, 7)}-01`), to: toIso };
    case "3months": {
      const [y, m] = today.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 3, 1)).toISOString().slice(0, 10);
      return { from: midnight(start), to: toIso };
    }
    case "year":
      return { from: midnight(`${today.slice(0, 4)}-01-01`), to: toIso };
    case "all":
      return { from: null, to: toIso };
    case "custom":
      return {
        from: custom?.from ? midnight(custom.from) : midnight(today),
        to: custom?.to
          ? new Date(`${custom.to}T23:59:59+08:00`).toISOString()
          : toIso,
      };
  }
}

export const RANGE_COMPARE_LABEL: Record<RangePreset, string> = {
  week: "vs last week",
  month: "vs last month",
  "3months": "vs previous 3 months",
  year: "vs last year",
  all: "",
  custom: "vs previous period",
};
