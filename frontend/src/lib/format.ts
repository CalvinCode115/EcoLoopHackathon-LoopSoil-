/** Display helpers shared by the taker and manager screens. */

/** 9 → "9", 2.5 → "2.5", 0.333 → "0.33". Kg values from the API are already rounded to the gram. */
export function formatKg(kg: number): string {
  return String(Math.round(kg * 100) / 100);
}

/** "22 Sep" (Singapore time). */
export function formatDayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
  });
}

/** First word of a display name, for greetings. */
export function firstName(name: string | undefined | null): string {
  return name?.trim().split(/\s+/)[0] ?? "";
}

/** "Sun 28 Sep" (Singapore time). */
export function formatWeekdayDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
  });
}

/** "2–4pm", "10am–12pm", "9:30–11am" for a slot window (Singapore time). */
export function formatTimeRange(startIso: string, endIso: string): string {
  const part = (iso: string) => {
    const s = new Date(iso).toLocaleTimeString("en-SG", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Singapore",
    });
    // "2:00 pm" → { time: "2", ampm: "pm" }
    const m = s
      .toLowerCase()
      .replace(/\s/g, "")
      .match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
    if (!m) return { time: s, ampm: "" };
    return {
      time: m[2] && m[2] !== "00" ? `${m[1]}:${m[2]}` : m[1],
      ampm: m[3],
    };
  };
  const a = part(startIso);
  const b = part(endIso);
  return a.ampm === b.ampm
    ? `${a.time}–${b.time}${b.ampm}`
    : `${a.time}${a.ampm}–${b.time}${b.ampm}`;
}

/** "1 day 4 hrs", "5 hrs", "40 min" until `iso`; "now" once past. */
export function formatTimeLeft(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "now";
  const mins = Math.floor(ms / 60_000);
  const days = Math.floor(mins / 1440);
  const hrs = Math.floor((mins % 1440) / 60);
  if (days > 0)
    return `${days} day${days === 1 ? "" : "s"}${hrs ? ` ${hrs} hr${hrs === 1 ? "" : "s"}` : ""}`;
  if (hrs > 0) return `${hrs} hr${hrs === 1 ? "" : "s"}`;
  return `${mins} min`;
}

/** "Tuesday, 30 Sep" (Singapore time). */
export function formatLongDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-SG", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
  });
}

/** YYYY-MM-DD of `iso` in Singapore time — for grouping slots by day. */
export function sgDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: "Asia/Singapore",
  });
}

/** "23 Sep 2026" (Singapore time). */
export function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  });
}

/** "2:20pm" (Singapore time). */
export function formatClock(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-SG", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Singapore",
    })
    .replace(/\s/g, "")
    .toLowerCase();
}

/** "28 Sep, 2:20pm" (Singapore time). */
export function formatDayTime(iso: string): string {
  return `${formatDayMonth(iso)}, ${formatClock(iso)}`;
}
