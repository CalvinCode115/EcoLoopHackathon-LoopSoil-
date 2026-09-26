import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Hanken_Grotesk,
  JetBrains_Mono,
} from "next/font/google";
import { Nav } from "@/components/nav";
import { AuthProvider } from "@/lib/auth-provider";
import { RouteGuard } from "@/lib/route-guard";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LoopSoil",
  description: "Closing the loop from campus waste to community soil.",
};

/**
 * Minimal shell: auth context, the single route guard, nav and a page container.
 * Font variables are set here; globals.css maps --font-display/body/mono to them.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>
        <AuthProvider>
          <Nav />
          <RouteGuard>
            <div id="page">{children}</div>
          </RouteGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
