/**
 * Build and download a one-event .ics file ("Add to calendar"), entirely client-side.
 * Times are written in UTC so every calendar app places them correctly.
 */
function icsDate(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function escapeText(s: string): string {
  // RFC 5545 text escaping: backslash, semicolon, comma, newline.
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function downloadIcs(event: {
  uid: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  filename?: string;
}): void {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LoopSoil//Pickup//EN",
    "BEGIN:VEVENT",
    `UID:${event.uid}@loopsoil`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(event.end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.description
      ? [`DESCRIPTION:${escapeText(event.description)}`]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([lines.join("\r\n")], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = event.filename ?? "loopsoil-pickup.ics";
  a.click();
  URL.revokeObjectURL(url);
}
