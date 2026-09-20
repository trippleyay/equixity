import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";

/**
 * Brand fonts load at the ROOT so the app (dashboard, login) and the
 * marketing (site) pages share one connected theme. Variables are prefixed
 * site-* for historical reasons; both Tailwind font tokens and the (site)
 * layout reference them. (site)/layout.tsx no longer loads its own copies.
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
  title: "Equixity - Merchant",
  description:
    "Reward your customers with real tokenized stocks instead of points.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-gray-50 font-sans text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
