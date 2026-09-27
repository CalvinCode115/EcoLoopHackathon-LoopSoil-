"use client";

import { List } from "@phosphor-icons/react/dist/ssr/List";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoLockup } from "@/components/brand/logo";
import { Button, IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Public Navbar: sticky beige bar, logo lockup left, links + Log In (always primary)
 * right. Gains a soft shadow once scrolled. Below 768px it collapses to a hamburger
 * with a full-width slide-down menu.
 */
const LINKS = [
  { href: "/", label: "Home" },
  { href: "/#background", label: "Background" },
  { href: "/tutorial", label: "Tutorial" },
];

export function PublicNavbar({ active = "Home" }: { active?: string }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-20 bg-beige transition-shadow",
        scrolled && "shadow-card",
      )}
    >
      <div className="page-container flex h-[72px] items-center justify-between">
        <Link
          href="/"
          aria-label="LoopSoil home"
          className="flex min-h-11 items-center no-underline"
        >
          <span className="hidden md:block">
            <LogoLockup />
          </span>
          <span className="md:hidden">
            <LogoLockup compact />
          </span>
        </Link>

        <nav aria-label="Main" className="hidden md:flex">
          <ul className="flex items-center gap-1">
            {LINKS.map((l) => (
              <li key={l.label}>
                <NavLink {...l} current={l.label === active} />
              </li>
            ))}
            <li className="ml-3">
              <Button href="/login" size="sm">
                Log In
              </Button>
            </li>
          </ul>
        </nav>

        <IconButton
          label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="public-menu"
          onClick={() => setOpen((o) => !o)}
          className="md:hidden"
        >
          {open ? <X size={24} /> : <List size={24} />}
        </IconButton>
      </div>

      {open && (
        <nav
          id="public-menu"
          aria-label="Main"
          className="bg-beige pb-4 shadow-card md:hidden"
        >
          <ul className="page-container flex flex-col gap-1">
            {LINKS.map((l) => (
              <li key={l.label}>
                <NavLink
                  {...l}
                  current={l.label === active}
                  onClick={() => setOpen(false)}
                />
              </li>
            ))}
            <li className="pt-2">
              <Button href="/login" fullWidth>
                Log In
              </Button>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}

function NavLink({
  href,
  label,
  current,
  onClick,
}: {
  href: string;
  label: string;
  current: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex h-11 items-center px-3 text-body leading-6 hover:text-leaf",
        current
          ? "font-semibold text-deep underline decoration-leaf decoration-2 underline-offset-[10px]"
          : "font-medium text-ink no-underline",
      )}
    >
      {label}
    </Link>
  );
}
