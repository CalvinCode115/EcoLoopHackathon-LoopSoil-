/** "2026-09" in Singapore time — the month a harvest / handover belongs to. */
export function yearMonthSG(date: Date): { year: string; month: string } {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  return {
    year: parts.find((p) => p.type === 'year')!.value,
    month: parts.find((p) => p.type === 'month')!.value,
  };
}

/**
 * Next zero-padded sequence number after a prefix, e.g.
 * nextSequence('HND-2026-09-', ['HND-2026-09-001', 'HND-2026-09-003']) → 'HND-2026-09-004'.
 * Compared numerically, so it keeps counting past 999.
 */
export function nextSequence(
  prefix: string,
  existing: string[],
  pad = 3,
): string {
  let max = 0;
  for (const ref of existing) {
    if (!ref.startsWith(prefix)) continue;
    const n = Number.parseInt(ref.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(pad, '0')}`;
}
