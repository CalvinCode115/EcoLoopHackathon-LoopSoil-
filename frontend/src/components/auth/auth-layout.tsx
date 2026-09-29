import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import Image from "next/image";
import type { ReactNode } from "react";
import { IconLeaf } from "@/components/brand/icons";
import { LoopSoilLogo } from "@/components/brand/logo";
import { PublicNavbar } from "@/components/nav/public-navbar";
import { cn } from "@/lib/cn";

/**
 * Shared by Log In, Sign Up and Sign Up Complete (design system → "AuthCard &
 * illustrations"): public navbar over a dark leaf-pattern background, the cream AuthCard
 * on the left and two framed, equal-height garden photos on the right. Below 768px the
 * photos stack under the card.
 */
export function AuthLayout({
  children,
  cardWidth = 420,
  photos = DEFAULT_PHOTOS,
}: {
  children: ReactNode;
  /** 420 for Log In, 480 for Sign Up. */
  cardWidth?: 420 | 480;
  photos?: AuthPhotoProps[];
}) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <LeafPatternBackdrop />
      <div className="relative z-[2] flex flex-1 flex-col">
        <PublicNavbar active="" />
        <main className="flex flex-1 items-center px-4 py-6 md:px-8 md:py-10 lg:px-10 lg:py-12">
          <div
            className={cn(
              "mx-auto flex w-full max-w-content flex-col gap-6 md:grid md:items-stretch md:gap-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-16",
              cardWidth === 420
                ? "lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]"
                : "lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]",
            )}
          >
            <div className="w-full" style={{ maxWidth: cardWidth }}>
              {children}
            </div>
            <div className="flex min-w-0 flex-col gap-3 md:gap-5">
              {photos.map((p) => (
                <AuthPhoto key={p.src} {...p} />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/** The cream card: 16px radius, deep shadow, 24/32/40px padding by breakpoint. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby="auth-title"
      className="flex flex-col gap-6 rounded-card bg-cream p-6 shadow-photo md:p-8 lg:p-10"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <LoopSoilLogo className="h-10" />
        <div className="flex flex-col gap-1">
          <h1
            id="auth-title"
            className="font-display m-0 text-h3 font-semibold text-deep"
          >
            {title}
          </h1>
          <p className="text-small text-muted">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Hairline — label — hairline, e.g. "New to LoopSoil?". */
export function AuthDivider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-muted/25" />
      <span className="text-small text-muted">{children}</span>
      <span className="h-px flex-1 bg-muted/25" />
    </div>
  );
}

interface AuthPhotoProps {
  src: string;
  alt: string;
  caption: string;
}

const DEFAULT_PHOTOS: AuthPhotoProps[] = [
  {
    src: "/images/auth/community-garden.jpg",
    alt: "Residents tending vegetable beds in a neighbourhood community garden",
    caption: "Community gardening",
  },
  {
    src: "/images/auth/hdb-corridor.jpg",
    alt: "Potted herbs and chilli plants on a railing along an HDB corridor",
    caption: "HDB corridor gardening",
  },
];

/** Cream frame with a thin leaf border; the photo is inset 8–10px inside it. */
function AuthPhoto({ src, alt, caption }: AuthPhotoProps) {
  return (
    <figure className="relative m-0 min-h-[184px] flex-1 rounded-[20px] border border-leaf/45 bg-cream shadow-photo md:min-h-[200px] lg:min-h-[240px]">
      <div className="absolute inset-2 overflow-hidden rounded-control lg:inset-2.5">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 1024px) 700px, (min-width: 768px) 40vw, 100vw"
          className="object-cover"
        />
      </div>
      <figcaption className="absolute bottom-5 left-5 flex items-center gap-2 rounded-control bg-cream/94 px-3 py-1.5 text-small font-medium text-ink shadow-[0_2px_8px_rgba(20,32,16,0.18)] lg:bottom-[22px] lg:left-[22px]">
        <span className="flex text-leaf">
          <IconLeaf size={16} />
        </span>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

/**
 * The "Background photo placeholder": a tiled leaf pattern on deep green under a dark
 * overlay. Leaves are the same shape as the illustrations, in muted greens.
 */
function LeafPatternBackdrop() {
  const leaves = [
    { x: 20, y: 60, r: -30, s: 1.2, flip: false, fill: "#3E5F30" },
    { x: 150, y: 40, r: 40, s: 1.0, flip: true, fill: "#4A6E39" },
    { x: 110, y: 170, r: -60, s: 1.4, flip: false, fill: "#46683A" },
    { x: 210, y: 210, r: 20, s: 0.9, flip: true, fill: "#3E5F30" },
    { x: 30, y: 220, r: 10, s: 0.8, flip: false, fill: "#557A42" },
    { x: 190, y: 120, r: -100, s: 0.7, flip: false, fill: "#557A42" },
  ];
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <svg width="100%" height="100%" className="absolute inset-0 block">
        <defs>
          <pattern
            id="auth-leaf-pattern"
            width="260"
            height="260"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-8)"
          >
            {leaves.map((l, i) => (
              <g
                key={i}
                transform={`translate(${l.x} ${l.y}) rotate(${l.r}) scale(${l.flip ? -l.s : l.s} ${l.s})`}
              >
                <path
                  d="M0 0 C 14 -26 50 -34 78 -18 C 56 4 22 10 0 0 Z"
                  fill={l.fill}
                  stroke="#2A4220"
                  strokeWidth={(3 / l.s).toFixed(2)}
                  strokeLinejoin="round"
                />
                <path
                  d="M6 -3 C 28 -12 50 -17 72 -18"
                  fill="none"
                  stroke="#2A4220"
                  strokeWidth={(2.1 / l.s).toFixed(2)}
                  strokeLinecap="round"
                />
              </g>
            ))}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#34522A" />
        <rect width="100%" height="100%" fill="url(#auth-leaf-pattern)" />
      </svg>
      <div className="absolute inset-0 bg-[rgba(28,44,22,0.55)]" />
    </div>
  );
}

/** Red banner at the top of an auth form (wrong password, "fix the highlighted fields"). */
export function FormErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-control bg-danger-tint px-4 py-3 text-small font-semibold text-error"
    >
      <WarningCircle size={20} weight="bold" className="shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
