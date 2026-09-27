import { EmptyPot, LeafSprig } from "@/components/brand/illustrations";
import { Footer } from "@/components/nav/footer";
import { PublicNavbar } from "@/components/nav/public-navbar";
import { Button } from "@/components/ui/button";

/**
 * 404 — boards "404 · Desktop / Tablet / Mobile". Rendered by Next for any unknown URL
 * (the route guard lets unknown paths through untouched, signed in or not).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicNavbar active="" />
      <main className="relative flex flex-1 items-center pb-[72px] pt-12 md:pb-[104px] md:pt-[72px] lg:pb-[120px] lg:pt-20">
        {/* Corner sprigs from tablet up — "edges only, never behind text". */}
        <LeafSprig
          rotate={20}
          width={110}
          className="absolute left-6 top-12 hidden md:block"
        />
        <LeafSprig
          rotate={190}
          width={110}
          className="absolute bottom-14 right-6 hidden md:block"
        />

        <div className="page-container relative">
          <div className="mx-auto flex max-w-[520px] flex-col items-center gap-3 text-center">
            <EmptyPot className="h-auto w-[180px] md:w-[220px] lg:w-[240px]" />
            <p
              aria-hidden
              className="font-display mt-2 text-[88px] font-bold leading-[88px] text-deep md:text-[112px] md:leading-[112px] lg:text-[120px] lg:leading-[120px]"
            >
              404
            </p>
            <h1 className="font-display m-0 text-h3 font-semibold text-deep">
              This patch hasn’t been planted yet
            </h1>
            <p className="text-body text-muted">
              The page you’re looking for doesn’t exist or has moved.
            </p>
            <div className="mt-2 flex w-full flex-col items-center gap-2 md:w-auto md:flex-row md:gap-4">
              <Button href="/" className="w-full md:w-auto">
                Back to Home
              </Button>
              <Button href="/login" variant="link" size="sm">
                Go to Log In
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
