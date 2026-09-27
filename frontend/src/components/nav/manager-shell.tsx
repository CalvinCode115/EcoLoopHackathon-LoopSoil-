"use client";

import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { ChartBar } from "@phosphor-icons/react/dist/ssr/ChartBar";
import { ClipboardText } from "@phosphor-icons/react/dist/ssr/ClipboardText";
import { Handshake } from "@phosphor-icons/react/dist/ssr/Handshake";
import { List } from "@phosphor-icons/react/dist/ssr/List";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { Package } from "@phosphor-icons/react/dist/ssr/Package";
import { SidebarSimple } from "@phosphor-icons/react/dist/ssr/SidebarSimple";
import { SignOut } from "@phosphor-icons/react/dist/ssr/SignOut";
import { SquaresFour } from "@phosphor-icons/react/dist/ssr/SquaresFour";
import { Users } from "@phosphor-icons/react/dist/ssr/Users";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LoopSoilLogo } from "@/components/brand/logo";
import { Button, IconButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { cn } from "@/lib/cn";
import { initials } from "./account-menu";

/** Subset of GET /reporting/pipeline used for the sidebar badges. */
interface Pipeline {
  claims: { pending: number };
  takers: { pendingVetting: number };
}

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  badge?: (p: Pipeline) => number;
  badgeLabel?: string;
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/manager", icon: <SquaresFour size={20} /> },
  { label: "Batches", href: "/manager/batches", icon: <Package size={20} /> },
  {
    label: "Claims",
    href: "/manager/claims",
    icon: <ClipboardText size={20} />,
    badge: (p) => p.claims.pending,
    badgeLabel: "pending",
  },
  {
    label: "Pickups",
    href: "/manager/slots",
    icon: <CalendarBlank size={20} />,
  },
  {
    label: "Handover",
    href: "/manager/handover",
    icon: <Handshake size={20} />,
  },
  {
    label: "Takers",
    href: "/manager/takers",
    icon: <Users size={20} />,
    badge: (p) => p.takers.pendingVetting,
    badgeLabel: "awaiting approval",
  },
  { label: "Reports", href: "/manager/reports", icon: <ChartBar size={20} /> },
];

function isCurrent(pathname: string, href: string): boolean {
  return href === "/manager"
    ? pathname === "/manager"
    : pathname.startsWith(href);
}

// ─── Top-bar breadcrumb, settable by pages ────────────────────────────────────

export interface Crumb {
  label: string;
  href?: string;
}

const CrumbContext = createContext<(crumbs: Crumb[] | null) => void>(() => {});

/**
 * Pages call this to replace the default breadcrumb, e.g. batch detail:
 * useManagerCrumbs([{ label: "Batches", href: "/manager/batches" }, { label: ref }]).
 * The last crumb is also the top-bar title.
 */
export function useManagerCrumbs(crumbs: Crumb[] | null) {
  const set = useContext(CrumbContext);
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    set(crumbs);
    return () => set(null);
    // `key` captures the crumbs' content; the array identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, set]);
}

const COLLAPSE_KEY = "loopsoil:sidebar-collapsed";

/**
 * Manager chrome (Manager components → Sidebar): 260px sidebar — logo + account menu,
 * search, nav with amber count badges, log out (with confirm), version and a collapse
 * toggle — plus a sticky top bar with breadcrumb and page title. Below 1024px the sidebar
 * opens as a drawer from the top bar.
 */
export function ManagerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [pageCrumbs, setPageCrumbs] = useState<Crumb[] | null>(null);
  const pipeline = usePipelineCounts(pathname);

  // Restore the collapse preference after mount (storage can throw in private mode).
  useEffect(() => {
    try {
      // Read after mount so the server render (expanded) matches first paint.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // ignore
      }
      return !c;
    });
  }

  const section =
    NAV.find((n) => isCurrent(pathname, n.href))?.label ?? "Dashboard";
  const crumbs: Crumb[] = pageCrumbs ?? [{ label: section }];
  const title = crumbs[crumbs.length - 1].label;
  const railWidth = collapsed ? "lg:pl-[76px]" : "lg:pl-[260px]";

  return (
    <CrumbContext.Provider value={setPageCrumbs}>
      <div className={cn("min-h-dvh print:!pl-0", railWidth)}>
        {drawerOpen && (
          <div
            aria-hidden
            className="fixed inset-0 z-40 bg-ink/30 lg:hidden"
            onClick={() => setDrawerOpen(false)}
          />
        )}

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col gap-5 bg-cream py-5 shadow-[1px_0_0_rgba(47,74,36,0.1)] transition-[transform,width] print:hidden",
            collapsed ? "px-4 lg:w-[76px] lg:px-3" : "px-4",
            drawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
        >
          <div
            className={cn(
              "flex items-center justify-between",
              collapsed && "lg:flex-col lg:gap-2",
            )}
          >
            <span className={cn(collapsed && "lg:hidden")}>
              <LoopSoilLogo className="w-[132px]" />
            </span>
            <span className="lg:hidden">
              <IconButton
                label="Close menu"
                onClick={() => setDrawerOpen(false)}
              >
                <X size={22} />
              </IconButton>
            </span>
            <span className="hidden lg:block">
              <ManagerAccountMenu onLogout={() => setConfirmLogout(true)} />
            </span>
          </div>

          {!collapsed && <SidebarSearch />}

          {/* Clicking any link closes the mobile drawer. */}
          <nav
            aria-label="Manager"
            className="flex-1 overflow-y-auto"
            onClick={() => setDrawerOpen(false)}
          >
            <ul className="flex flex-col gap-1">
              {NAV.map((item) => (
                <li key={item.label}>
                  <SideItem
                    item={item}
                    current={isCurrent(pathname, item.href)}
                    count={pipeline && item.badge ? item.badge(pipeline) : 0}
                    collapsed={collapsed}
                  />
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex flex-col gap-1.5">
            <div className="mx-1 mb-1.5 h-px bg-muted/20" />
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              title={collapsed ? "Log out" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-control px-3 text-[15px] font-semibold text-error hover:bg-danger-tint",
                collapsed && "lg:justify-center lg:px-0",
              )}
            >
              <SignOut size={20} aria-hidden />
              <span className={cn(collapsed && "lg:sr-only")}>Log out</span>
            </button>
            <div
              className={cn(
                "flex items-center justify-between pl-3",
                collapsed && "lg:justify-center lg:pl-0",
              )}
            >
              <span
                className={cn("text-xs text-muted", collapsed && "lg:hidden")}
              >
                SUSS Manager · v0.1
              </span>
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-pressed={collapsed}
                className="hidden size-11 items-center justify-center rounded-control text-muted hover:bg-sage lg:flex"
              >
                <SidebarSimple
                  size={20}
                  className={cn(collapsed && "-scale-x-100")}
                />
              </button>
            </div>
          </div>
        </aside>

        <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 bg-beige/95 px-4 shadow-topbar md:px-8 print:hidden">
          <span className="lg:hidden">
            <IconButton
              label="Open menu"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <List size={24} />
            </IconButton>
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <nav
              aria-label="Breadcrumb"
              className="truncate text-[13px] leading-[18px]"
            >
              <Link
                href="/manager"
                className="text-muted no-underline hover:text-deep"
              >
                Manager
              </Link>
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <span key={`${c.label}-${i}`}>
                    <span aria-hidden className="mx-1.5 text-[#B9B6AA]">
                      /
                    </span>
                    {last || !c.href ? (
                      <span
                        aria-current={last ? "page" : undefined}
                        className={
                          last ? "font-semibold text-deep" : "text-muted"
                        }
                      >
                        {c.label}
                      </span>
                    ) : (
                      <Link
                        href={c.href}
                        className="text-muted no-underline hover:text-deep"
                      >
                        {c.label}
                      </Link>
                    )}
                  </span>
                );
              })}
            </nav>
            <p className="font-display m-0 truncate text-[22px] font-semibold leading-[30px] text-deep">
              {title}
            </p>
          </div>
        </header>

        <main className="px-4 pb-12 pt-7 md:px-8 print:p-0">{children}</main>

        {confirmLogout && (
          <LogoutConfirm onClose={() => setConfirmLogout(false)} />
        )}
      </div>
    </CrumbContext.Provider>
  );
}

function SideItem({
  item,
  current,
  count,
  collapsed,
}: {
  item: NavItem;
  current: boolean;
  count: number;
  collapsed: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "relative flex h-11 items-center gap-3 rounded-control px-3 text-[15px] no-underline",
        current
          ? "bg-leaf font-bold text-cream"
          : "font-medium text-ink hover:bg-sage hover:text-deep",
        collapsed && "lg:justify-center lg:px-0",
      )}
    >
      {item.icon}
      <span className={cn(collapsed && "lg:sr-only")}>{item.label}</span>
      {count > 0 && (
        <span
          aria-label={`${count} ${item.badgeLabel ?? ""}`.trim()}
          className={cn(
            "h-[22px] min-w-6 rounded-full bg-amber-tint px-[7px] text-center text-xs font-bold leading-[22px] text-amber-ink",
            collapsed
              ? "ml-auto lg:absolute lg:-right-1 lg:-top-1 lg:ml-0"
              : "ml-auto",
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

/** Avatar → menu: name, "Manager" tag, Log out (goes through the confirm dialog). */
function ManagerAccountMenu({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex size-11 items-center justify-center rounded-full hover:bg-sage"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-deep text-[13px] font-bold text-cream">
          {initials(user?.name)}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-[70] mt-2 w-60 rounded-card bg-cream p-2 shadow-photo"
        >
          <div className="mb-1.5 flex flex-col gap-0.5 px-3.5 pb-3 pt-2.5 shadow-[inset_0_-1px_0_rgba(107,107,94,0.18)]">
            <span className="truncate text-body font-bold">{user?.name}</span>
            <span className="truncate text-xs text-muted">{user?.email}</span>
            <span className="mt-1 self-start rounded-lg bg-sage px-2 py-0.5 text-xs font-bold text-deep">
              Manager
            </span>
          </div>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex h-11 w-full items-center gap-3 rounded-[10px] px-3.5 text-left text-[15px] font-medium text-error hover:bg-sage"
          >
            <SignOut size={18} aria-hidden /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

function LogoutConfirm({ onClose }: { onClose: () => void }) {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <Sheet labelledBy="logout-title" onClose={onClose}>
      <h3
        id="logout-title"
        className="font-display m-0 text-[22px] font-semibold leading-[30px] text-deep"
      >
        Log out of LoopSoil?
      </h3>
      <p className="text-[15px] leading-[23px] text-muted">
        You’ll need to log in again to manage batches, claims and pickups.
      </p>
      <div className="flex justify-end gap-2.5">
        <Button variant="secondary" className="px-[18px]" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          className="px-[22px]"
          loading={busy}
          onClick={() => {
            setBusy(true);
            void signOut();
          }}
        >
          Log out
        </Button>
      </div>
    </Sheet>
  );
}

/**
 * PLACEHOLDER: sidebar search (GET /manager/search) is a SECONDARY backend item and isn't
 * built — the field is shown per the design but disabled.
 */
function SidebarSearch() {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-1">
        <label
          htmlFor="mg-search"
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted"
        >
          Search
        </label>
        <kbd className="rounded-md bg-beige px-1.5 py-px font-sans text-[11px] font-bold text-muted shadow-[inset_0_0_0_1px_rgba(143,142,128,0.4)]">
          ⌘K
        </kbd>
      </div>
      <div className="flex h-11 items-center gap-2 rounded-control bg-white px-3 opacity-60 shadow-[inset_0_0_0_1px_rgba(143,142,128,0.6)]">
        <MagnifyingGlass size={18} className="text-muted" aria-hidden />
        <input
          id="mg-search"
          type="search"
          disabled
          placeholder="Search coming soon"
          title="Search isn't available yet"
          className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-ink outline-none"
        />
      </div>
    </div>
  );
}

/** Refreshes the badge counts on every navigation — cheap (counts only). */
function usePipelineCounts(pathname: string): Pipeline | null {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const load = useCallback(() => api.get<Pipeline>("/reporting/pipeline"), []);
  useEffect(() => {
    let cancelled = false;
    load()
      .then((p) => !cancelled && setPipeline(p))
      .catch(() => {
        // Badges are a nicety; the page itself reports API errors.
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, load]);
  return pipeline;
}
