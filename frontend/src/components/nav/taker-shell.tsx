"use client";

import { ArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { ClipboardText } from "@phosphor-icons/react/dist/ssr/ClipboardText";
import { Plant } from "@phosphor-icons/react/dist/ssr/Plant";
import { User as UserIcon } from "@phosphor-icons/react/dist/ssr/User";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { IconLeaf } from "@/components/brand/icons";
import { LogoLockup } from "@/components/brand/logo";
import { Banner } from "@/components/ui/banner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { cn } from "@/lib/cn";
import type { TakerStatus } from "@/lib/labels";
import { completePendingRegistration } from "@/lib/taker-signup";
import { AccountMenu } from "./account-menu";

// ─── Taker account (drives the gate banners and disabled claim buttons) ────────

export interface TakerAccount {
  id: string;
  name: string;
  phone: string | null;
  intendedUse: string | null;
  status: TakerStatus;
  statusReason: string | null;
}

interface TakerAccountState {
  /** null = not registered as a taker yet (or still loading — check `loading`). */
  taker: TakerAccount | null;
  loading: boolean;
  /** Only APPROVED takers can claim or book. */
  canClaim: boolean;
  refresh: () => Promise<void>;
}

const TakerAccountContext = createContext<TakerAccountState | null>(null);

export function useTakerAccount(): TakerAccountState {
  const ctx = useContext(TakerAccountContext);
  if (!ctx) throw new Error("useTakerAccount must be used inside <TakerShell>");
  return ctx;
}

// ─── Navigation ────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  /** null = the design has this page but the skeleton has no route for it yet. */
  href: string | null;
  icon: ReactNode;
  /** Routes that highlight this item. */
  match: string[];
}

const NAV: NavItem[] = [
  {
    label: "Compost",
    href: "/batches",
    icon: <Plant size={18} weight="bold" />,
    match: ["/batches", "/claim"],
  },
  {
    label: "My Claims",
    href: "/my-claims",
    icon: <ClipboardText size={18} weight="bold" />,
    match: ["/my-claims", "/book-pickup", "/change-pickup", "/pickup-pass"],
  },
  {
    label: "Profile",
    href: "/profile",
    icon: <UserIcon size={18} weight="bold" />,
    match: ["/profile"],
  },
];

/** Screens with their own bare top bar (no tabs/banner). */
const FOCUSED: Record<
  string,
  { title: string; back: string; backLabel: string }
> = {
  "/pickup-pass": {
    title: "Pickup pass",
    back: "/my-claims",
    backLabel: "Back to My Claims",
  },
};

/** Page title shown in the top bar, per route. */
const TITLES: Record<string, string> = {
  "/batches": "Compost",
  "/claim": "Claim compost",
  "/my-claims": "My Claims",
  "/book-pickup": "Book pickup",
  "/change-pickup": "Change pickup",
  "/pickup-pass": "Pickup pass",
  "/profile": "Profile",
};

/**
 * Logged-in taker chrome. Desktop: logo lockup, page title, the 3 main links, avatar
 * menu. Mobile: a 40px leaf mark, page title and avatar on top; the 3 links move to a
 * bottom tab bar. Account-gate banners sit directly under the top bar on every page.
 * Pages render their own <h1>; the bar's title is a label, not a heading.
 */
export function TakerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const title = TITLES[pathname] ?? "LoopSoil";
  const account = useLoadTakerAccount();

  // Focused screens (the pickup pass) get a bare "← title" bar: no nav, banner or decor,
  // so the pass is all that's on screen when it's shown to staff.
  if (FOCUSED[pathname]) {
    return (
      <TakerAccountContext.Provider value={account}>
        <div className="flex min-h-dvh flex-col">
          <header className="sticky top-0 z-30 bg-beige shadow-topbar">
            <div className="mx-auto flex h-16 w-full max-w-content items-center gap-2 pl-2 pr-4 md:px-8">
              <Link
                href={FOCUSED[pathname].back}
                aria-label={FOCUSED[pathname].backLabel}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-deep hover:bg-sage"
              >
                <ArrowLeft size={24} aria-hidden />
              </Link>
              <h1 className="font-display m-0 text-xl font-semibold leading-7 text-deep">
                {FOCUSED[pathname].title}
              </h1>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </TakerAccountContext.Provider>
    );
  }

  return (
    <TakerAccountContext.Provider value={account}>
      <div className="relative flex min-h-dvh flex-col">
        <PlantDecor />
        <header className="sticky top-0 z-30 bg-beige shadow-topbar">
          <div className="flex h-16 items-center gap-3 pl-4 pr-3 md:page-container md:h-[72px] md:gap-5">
            <Link
              href="/batches"
              aria-label="LoopSoil home"
              className="flex min-h-11 shrink-0 items-center no-underline"
            >
              <span className="hidden md:block">
                <LogoLockup />
              </span>
              {/* Mobile: the leaf mark alone, in a dashed placeholder slot. */}
              <span className="flex size-10 items-center justify-center rounded-control bg-sage text-deep outline-[1.5px] -outline-offset-[1.5px] outline-dashed outline-deep/35 md:hidden">
                <IconLeaf size={20} />
              </span>
            </Link>
            <span
              aria-hidden
              className="hidden h-7 w-px bg-muted/30 md:block"
            />
            <p className="font-display min-w-0 flex-1 truncate text-xl font-semibold text-deep">
              {title}
            </p>
            <nav aria-label="Main" className="hidden md:flex">
              <ul className="flex items-center gap-1">
                {NAV.map((item) => (
                  <li key={item.label}>
                    <TopLink
                      item={item}
                      current={item.match.includes(pathname)}
                    />
                  </li>
                ))}
              </ul>
            </nav>
            <AccountMenu variant="taker" profileHref="/profile" />
          </div>
        </header>

        <AccountBanner taker={account.taker} loading={account.loading} />

        <main className="relative z-[1] flex-1">{children}</main>

        <nav
          aria-label="Main"
          className="sticky bottom-0 z-30 bg-cream px-2 pb-2 pt-1 shadow-[0_-1px_0_rgba(47,74,36,0.08),0_-8px_24px_rgba(47,74,36,0.06)] md:hidden"
        >
          <ul className="flex gap-1">
            {NAV.map((item) => (
              <li key={item.label} className="flex-1">
                <TabLink item={item} current={item.match.includes(pathname)} />
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </TakerAccountContext.Provider>
  );
}

function TopLink({ item, current }: { item: NavItem; current: boolean }) {
  const cls = cn(
    "flex h-11 items-center gap-2 px-3.5 text-body text-deep",
    current
      ? "font-semibold underline decoration-leaf decoration-2 underline-offset-[10px]"
      : "font-medium no-underline hover:text-leaf",
  );
  const icon = (
    <span className={current ? "text-leaf" : "text-muted"}>{item.icon}</span>
  );
  if (!item.href) {
    return (
      <span
        aria-disabled="true"
        title="Coming soon"
        className={cn(cls, "cursor-not-allowed opacity-50")}
      >
        {icon}
        {item.label}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={cls}
    >
      {icon}
      {item.label}
    </Link>
  );
}

function TabLink({ item, current }: { item: NavItem; current: boolean }) {
  const cls = cn(
    "flex h-16 flex-col items-center justify-center gap-0.5 rounded-control text-xs no-underline hover:bg-sage",
    current ? "font-bold text-deep" : "font-medium text-muted",
  );
  const inner = (
    <>
      <span
        className={cn(
          "flex h-[30px] w-14 items-center justify-center rounded-full",
          current && "bg-sage",
        )}
      >
        {item.icon}
      </span>
      <span>{item.label}</span>
    </>
  );
  if (!item.href) {
    return (
      <span
        aria-disabled="true"
        title="Coming soon"
        className={cn(cls, "cursor-not-allowed opacity-50")}
      >
        {inner}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={cls}
    >
      {inner}
    </Link>
  );
}

function AccountBanner({
  taker,
  loading,
}: {
  taker: TakerAccount | null;
  loading: boolean;
}) {
  if (loading || !taker) return null;
  if (taker.status === "PENDING") {
    return (
      <Banner tone="amber" title="Your account is awaiting approval.">
        You can browse, but claiming unlocks once approved.
      </Banner>
    );
  }
  if (taker.status === "SUSPENDED") {
    return (
      <Banner tone="red" title="Your account is suspended.">
        Browsing and claiming are paused. Contact the SUSS team at [contact] to
        restore access.
      </Banner>
    );
  }
  if (taker.status === "REJECTED") {
    // Not in the design — same red treatment as suspended. [draft copy]
    return (
      <Banner tone="red" title="Your registration wasn’t approved.">
        {taker.statusReason ??
          "Contact the SUSS team at [contact] if you think this is a mistake."}
      </Banner>
    );
  }
  return null;
}

/**
 * GET /takers/me. A logged-in taker with no taker record yet (404) gets one created from
 * what Sign Up saved (see lib/taker-signup.ts), so they land as PENDING with the amber
 * banner. null only when that also fails.
 */
async function fetchTakerAccount(
  email: string | undefined,
): Promise<TakerAccount | null> {
  try {
    return await api.get<TakerAccount>("/takers/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404 && email) {
      try {
        await completePendingRegistration(email);
        return await api.get<TakerAccount>("/takers/me");
      } catch (retryErr) {
        console.error(retryErr);
        return null;
      }
    }
    // Other failures: no banner; the pages themselves surface API errors.
    if (!(err instanceof ApiError)) console.error(err);
    return null;
  }
}

function useLoadTakerAccount(): TakerAccountState {
  const [taker, setTaker] = useState<TakerAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const { user } = useAuth();
  const email = user?.email;

  const refresh = useCallback(async () => {
    setTaker(await fetchTakerAccount(email));
    setLoading(false);
  }, [email]);

  useEffect(() => {
    let cancelled = false;
    void fetchTakerAccount(email).then((t) => {
      if (cancelled) return;
      setTaker(t);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [email]);

  return { taker, loading, canClaim: taker?.status === "APPROVED", refresh };
}

/**
 * "Plant decor": two cut-out plant photos peeking in from the page edges, behind all
 * content (z-0, no pointer events). Positions from the Browse boards.
 */
function PlantDecor() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {/* Mobile */}
      <Image
        src="/images/taker/plant-decor-a.webp"
        alt=""
        width={170}
        height={170}
        className="absolute -right-[92px] top-[58px] w-[170px] rotate-[10deg] opacity-85 md:hidden h-auto"
      />
      <Image
        src="/images/taker/plant-decor-b.webp"
        alt=""
        width={247}
        height={247}
        className="absolute -left-[94px] top-[394px] w-[247px] rotate-[28deg] opacity-85 md:hidden h-auto"
      />
      {/* Desktop */}
      <Image
        src="/images/taker/plant-decor-a.webp"
        alt=""
        width={299}
        height={299}
        className="absolute -right-[73px] top-16 hidden w-[299px] rotate-[8deg] opacity-95 md:block h-auto"
      />
      <Image
        src="/images/taker/plant-decor-b.webp"
        alt=""
        width={364}
        height={364}
        className="absolute -bottom-[60px] -left-[126px] hidden w-[364px] rotate-[22deg] opacity-95 md:block h-auto"
      />
      <Image
        src="/images/taker/plant-decor-a.webp"
        alt=""
        width={273}
        height={273}
        className="absolute -left-[100px] top-[538px] hidden w-[273px] -scale-x-100 -rotate-12 opacity-95 md:block h-auto"
      />
      <Image
        src="/images/taker/plant-decor-b.webp"
        alt=""
        width={312}
        height={312}
        className="absolute -right-[115px] top-[927px] hidden w-[312px] -rotate-[28deg] opacity-95 md:block h-auto"
      />
    </div>
  );
}
