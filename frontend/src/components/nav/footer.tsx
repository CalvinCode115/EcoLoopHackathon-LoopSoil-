import Link from "next/link";
import { LeafSprig } from "@/components/brand/illustrations";
import { LoopSoilLogo } from "@/components/brand/logo";

/** Deep green, cream text, sage column headings. Same content on every public page. */
const QUICK_LINKS = [
  { href: "/", label: "Home" },
  { href: "/#background", label: "Background" },
  { href: "/awareness", label: "Awareness" },
  { href: "/tutorial", label: "Tutorial" },
  { href: "/login", label: "Log In" },
];

const heading =
  "m-0 text-small font-bold uppercase tracking-[0.06em] text-sage";

export function Footer() {
  return (
    <footer className="relative bg-deep text-cream">
      {/* A leaf sprig overhanging the top edge. */}
      <LeafSprig
        rotate={-10}
        light
        className="absolute -top-9 right-6 hidden md:block lg:right-10"
      />
      <div className="page-container flex flex-col gap-12 pb-8 pt-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr] lg:gap-12">
          <div className="flex max-w-[360px] flex-col gap-4 md:col-span-2 lg:col-span-1">
            <LoopSoilLogo onDark className="h-9" />
            <p className="font-display text-[22px] leading-[30px] text-cream">
              Closing the loop from campus waste to community soil.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-col gap-2">
            <h2 className={heading}>Quick links</h2>
            <ul className="flex flex-col">
              {QUICK_LINKS.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="inline-flex min-h-11 items-center text-body leading-6 text-cream/90 no-underline hover:text-white hover:underline"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex flex-col gap-3">
            <h2 className={heading}>The team</h2>
            <p className="text-body text-cream/90">Built by Team GSM</p>
            <p className="text-small text-cream/80">
              A student-initiated prototype for the Eco Loop Hackathon 2026.
            </p>
          </div>
        </div>
        <div className="pt-6 shadow-[inset_0_1px_0_rgba(251,248,241,0.16)]">
          <p className="text-small text-cream/80">
            © 2026 LoopSoil. Student prototype for the Eco Loop Hackathon.
          </p>
        </div>
      </div>
    </footer>
  );
}
