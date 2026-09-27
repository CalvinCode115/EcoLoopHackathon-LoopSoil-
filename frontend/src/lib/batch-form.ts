/**
 * Shared by "Log new batch" and the Draft batch's editable info card: the same rules and
 * the same error wording (board "New batch · validation errors"), and the same payload.
 * Dates are YYYY-MM-DD in Singapore time; "Until" means the end of that day.
 */
export interface BatchFormValues {
  harvest: string;
  total: string;
  reserve: string;
  ph: string;
  from: string;
  until: string;
  location: string;
  notes: string;
}

export type BatchFormErrors = Partial<
  Record<keyof BatchFormValues | "reference", string>
>;

export function validateBatchForm(v: BatchFormValues): BatchFormErrors {
  const e: BatchFormErrors = {};
  const totalKg = Number(v.total);
  const reserveKg = v.reserve === "" ? 0 : Number(v.reserve);
  if (!v.harvest) e.harvest = "Pick the harvest date";
  if (!(totalKg > 0)) e.total = "Total kg must be more than 0";
  if (v.reserve !== "" && !(reserveKg >= 0))
    e.reserve = "School reserve can’t be negative";
  else if (totalKg > 0 && reserveKg > totalKg)
    e.reserve = "School reserve can’t be more than the total kg";
  if (v.ph !== "" && !(Number(v.ph) >= 0 && Number(v.ph) <= 14))
    e.ph = "pH must be between 0 and 14";
  if (!v.from) e.from = "Pick when claiming opens";
  if (!v.until) e.until = "Pick when claiming closes";
  else if (v.from && v.until <= v.from)
    e.until = "“Until” must be after “Available from”";
  return e;
}

/** Body for POST /batches and PATCH /batches/:id. */
export function batchPayload(v: BatchFormValues) {
  return {
    harvestDate: `${v.harvest}T00:00:00+08:00`,
    totalKg: Number(v.total),
    schoolReserveKg: v.reserve === "" ? 0 : Number(v.reserve),
    phReading: v.ph === "" ? undefined : Number(v.ph),
    availableFrom: `${v.from}T00:00:00+08:00`,
    availableUntil: `${v.until}T23:59:59+08:00`,
    pickupLocation: v.location.trim() || undefined,
    notes: v.notes.trim() || undefined,
  };
}

/** "2026-09-29" + 13 → "2026-10-12" (pure calendar maths, no timezone drift). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
