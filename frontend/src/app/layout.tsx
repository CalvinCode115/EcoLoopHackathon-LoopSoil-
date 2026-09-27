import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { AuthProvider } from "@/lib/auth-provider";
import { RouteGuard } from "@/lib/route-guard";
import "./globals.css";

/** Headings. The SOFT axis is loaded so `font-display` can turn it on (globals.css). */
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
  variable: "--font-fraunces",
  display: "swap",
});

/** Body and UI. */
const dmSans = DM_Sans({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LoopSoil",
  description: "Closing the loop from campus waste to community soil.",
};

/**
 * Auth context and the single route guard. Chrome (public navbar, taker top bar,
 * manager sidebar) lives in each route group's layout, not here.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`}>
      <body>
        <AuthProvider>
          <RouteGuard>{children}</RouteGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
