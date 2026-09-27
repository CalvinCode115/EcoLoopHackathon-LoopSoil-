import QRCode from "qrcode";
import { useMemo } from "react";

/**
 * A real, scannable QR code drawn as crisp SVG squares (design: "QR code", 264px), with
 * the standard 4-module white margin so phone and handheld scanners read it reliably.
 * `faded` greys it out for expired/cancelled passes.
 */
export function QrCode({
  value,
  size = 264,
  label,
  faded = false,
}: {
  value: string;
  size?: number;
  label: string;
  faded?: boolean;
}) {
  const { path, count } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(x, y)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
      }
    }
    return { path: d, count: n + 8 };
  }, [value]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${count} ${count}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      className="block bg-white"
    >
      <rect width={count} height={count} fill="#FFFFFF" />
      <path d={path} fill={faded ? "#9A988C" : "#141410"} />
    </svg>
  );
}
