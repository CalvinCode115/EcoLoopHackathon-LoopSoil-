"use client";

import { Lightning } from "@phosphor-icons/react/dist/ssr/Lightning";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import jsQR from "jsqr";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** The browser's native detector where it exists (Chrome / Android); jsQR otherwise (iOS Safari). */
interface NativeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => NativeDetector;
  }
}

/**
 * Board "Handover · Scanner": full-screen camera with a framed target. Decodes the pickup
 * pass QR (the claim reference) and hands it to `onResult`. `sheet` renders the result
 * bottom sheet over the camera ("No pickup found", "Already collected") while `paused`.
 */
export function QrScanner({
  paused,
  sheet,
  onResult,
  onManual,
  onClose,
}: {
  paused: boolean;
  sheet?: ReactNode;
  onResult: (text: string) => void;
  onManual: () => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pausedRef = useRef(paused);
  const onResultRef = useRef(onResult);
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({
    supported: false,
    on: false,
  });

  useEffect(() => {
    pausedRef.current = paused;
    onResultRef.current = onResult;
  });

  useEffect(() => {
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const native =
      typeof window !== "undefined" && window.BarcodeDetector
        ? new window.BarcodeDetector({ formats: ["qr_code"] })
        : null;
    let busy = false;

    async function tick() {
      if (stopped) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && !pausedRef.current && !busy) {
        busy = true;
        try {
          let text: string | null = null;
          if (native) {
            const codes = await native.detect(video);
            text = codes[0]?.rawValue ?? null;
          } else if (ctx) {
            const w = video.videoWidth;
            const h = video.videoHeight;
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            text = jsQR(ctx.getImageData(0, 0, w, h).data, w, h)?.data ?? null;
          }
          if (text && !pausedRef.current) onResultRef.current(text.trim());
        } catch {
          // a frame failed to decode — try the next one
        } finally {
          busy = false;
        }
      }
      raf = requestAnimationFrame(() => void tick());
    }

    // No camera API (old browser / plain http) goes through the same catch below.
    const camera = navigator.mediaDevices
      ? navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        })
      : Promise.reject(new Error("no-camera-api"));
    camera
      .then((stream) => {
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch({ supported: !!caps.torch, on: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
        raf = requestAnimationFrame(() => void tick());
      })
      .catch((err: Error) =>
        setError(
          err.message === "no-camera-api"
            ? "This browser can’t open the camera. Enter the reference instead."
            : "Camera unavailable. Allow camera access, or enter the reference instead.",
        ),
      );

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const on = !torch.on;
    try {
      await track.applyConstraints({
        advanced: [{ torch: on } as MediaTrackConstraintSet],
      });
      setTorch({ supported: true, on });
    } catch {
      setTorch({ supported: false, on: false });
    }
  }

  const iconBtn =
    "flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-black/35 text-cream hover:bg-black/50";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan pickup pass"
      className="fixed inset-0 z-[70] overflow-hidden bg-[#121210]"
    >
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Camera view"
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute left-1/2 top-[150px] size-[240px] -translate-x-1/2 rounded-card shadow-[0_0_0_2000px_rgba(0,0,0,0.45)]">
        {(
          [
            "left-[-3px] top-[-3px] border-l-[5px] border-t-[5px] rounded-tl-card",
            "right-[-3px] top-[-3px] border-r-[5px] border-t-[5px] rounded-tr-card",
            "bottom-[-3px] left-[-3px] border-b-[5px] border-l-[5px] rounded-bl-card",
            "bottom-[-3px] right-[-3px] border-b-[5px] border-r-[5px] rounded-br-card",
          ] as const
        ).map((c) => (
          <span
            key={c}
            aria-hidden
            className={`absolute size-10 border-cream ${c}`}
          />
        ))}
        {!paused && !error && (
          <span
            aria-hidden
            className="absolute inset-x-3 top-[58%] h-0.5 animate-pulse bg-[#7FB858] shadow-[0_0_12px_#7FB858]"
          />
        )}
      </div>

      <div className="absolute inset-x-0 top-0 z-[3] flex items-center justify-between p-3">
        <button
          type="button"
          aria-label="Close scanner"
          onClick={onClose}
          className={iconBtn}
        >
          <X size={24} />
        </button>
        <strong className="text-[17px] text-cream">Scan pickup pass</strong>
        {torch.supported ? (
          <button
            type="button"
            aria-label={torch.on ? "Torch off" : "Torch on"}
            aria-pressed={torch.on}
            onClick={() => void toggleTorch()}
            className={iconBtn}
          >
            <Lightning size={24} weight={torch.on ? "fill" : "regular"} />
          </button>
        ) : (
          <span className="size-12" />
        )}
      </div>

      <div className="absolute inset-x-0 top-[410px] z-[3] flex flex-col items-center gap-4 px-6 text-center">
        <p
          className="text-[17px] font-semibold leading-6 text-cream"
          role={error ? "alert" : undefined}
        >
          {error ?? "Point at the taker’s pickup pass"}
        </p>
        <button
          type="button"
          onClick={onManual}
          className="h-[52px] rounded-[14px] bg-cream/15 px-[22px] text-body font-bold text-cream shadow-[inset_0_0_0_1.5px_rgba(251,248,241,0.6)] hover:bg-cream/25"
        >
          Enter reference instead
        </button>
      </div>

      {sheet && (
        <div className="absolute inset-x-0 bottom-0 z-[90] flex flex-col gap-3.5 rounded-t-3xl bg-cream px-5 pb-6 pt-2.5 shadow-photo md:left-1/2 md:w-[440px] md:-translate-x-1/2">
          <span
            aria-hidden
            className="h-[5px] w-11 self-center rounded-sm bg-[#D6D0C2]"
          />
          {sheet}
        </div>
      )}
    </div>
  );
}
