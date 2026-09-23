"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The docs navigation. This is the ONLY client component in the docs tree, and
 * it exists for one reason: the current page has to look current.
 */
export const DOC_LINKS = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/getting-started", label: "Getting started" },
  { href: "/docs/configuring-rewards", label: "Configuring rewards" },
  { href: "/docs/success-page-snippet", label: "Success page snippet" },
  { href: "/docs/connecting-your-checkout", label: "Connecting your checkout" },
  { href: "/docs/api-reference", label: "API reference" },
] as const;

export default function DocsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Documentation">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate">
        Documentation
      </p>
      <ul className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:mt-5 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
        {DOC_LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href} className="shrink-0 lg:shrink">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap rounded-xl px-3 py-2 text-[0.92rem] transition-colors lg:whitespace-normal ${
                  active
                    ? "bg-equixity-mist font-medium text-equixity-deep"
                    : "text-slate hover:bg-ink/5 hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
