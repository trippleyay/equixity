import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./site.css";
import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";

/**
 * (site) — the public marketing pages (/  /about  /docs  /terms  /privacy
 * /merchant). Route group: no URL prefix, so the app's own routes (/login,
 * /dashboard, /claim/*, /api/*) are untouched.
 *
 * The marketing design was built standalone (see builds/equixity-site, kept
 * as the design source of record) and is imported 1:1 — markup and classes
 * are copied verbatim. The two deltas from the standalone project:
 * - <html>/<body> belong to the app's root layout, so the site's body
 *   classes/base styles live on this wrapper div (see site.css).
 * - Tailwind tokens (equixity palette, ink/slate/paper, font families,
 *   max-w-content/prose) are declared as Tailwind v4 @theme tokens in
 *   src/app/globals.css so the same class names resolve in this app.
 *
 * Fonts load here (not in the root layout) so the marketing typefaces are
 * only fetched by these pages. Variables are prefixed site-* to never
 * collide with anything the app defines.
 */
const display = Fraunces({
  subsets: ["latin"],
  variable: "--site-font-display",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--site-font-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Equixity: own a piece of what you buy",
  description:
    "Equixity gifts customers real, tokenized stock as a reward for shopping, delivered to a wallet they already own. No crypto experience required, on either side of the checkout.",
};

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`site-root ${display.variable} ${sans.variable} min-h-screen bg-paper font-sans text-ink antialiased`}
    >
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
