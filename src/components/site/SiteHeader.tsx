"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Wordmark from "./Wordmark";
import Button from "./Button";
import Container from "./Container";

const navLinks = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
  { href: "/docs", label: "Docs" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(!isHome);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!isHome) {
      setScrolled(true);
      return;
    }
    const onScroll = () => {
      setScrolled(window.scrollY > window.innerHeight * 0.72);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  const transparent = isHome && !scrolled;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        transparent ? "bg-transparent" : "bg-white/95 backdrop-blur-sm shadow-[0_1px_0_0_rgba(28,19,32,0.06)]"
      }`}
    >
      <div className="flex h-20 w-full items-center justify-between px-6 sm:px-10">
        <Link href="/" className="flex items-center" onClick={() => setMenuOpen(false)}>
          <Wordmark variant={transparent ? "light" : "dark"} className="h-7 w-auto sm:h-9" />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-[0.95rem] font-medium transition-colors ${
                transparent ? "text-white/90 hover:text-white" : "text-slate hover:text-ink"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Button href="/merchant" variant={transparent ? "outlineOnDark" : "solid"} className="px-5 py-2.5 text-[0.9rem]">
            Merchant
          </Button>
        </nav>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          className={`flex h-10 w-10 items-center justify-center rounded-full md:hidden ${
            transparent ? "text-white" : "text-ink"
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            {menuOpen ? (
              <path d="M4 4L18 18M18 4L4 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            ) : (
              <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-ink/5 bg-white md:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-2 py-3 text-[0.95rem] font-medium text-ink hover:bg-equixity-mist"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/merchant"
              onClick={() => setMenuOpen(false)}
              className="mt-1 rounded-full bg-equixity-deep px-5 py-3 text-center text-[0.95rem] font-medium text-white"
            >
              Merchant
            </Link>
          </Container>
        </div>
      )}
    </header>
  );
}
