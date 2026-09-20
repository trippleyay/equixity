import Link from "next/link";
import Wordmark from "./Wordmark";
import Container from "./Container";

const columns = [
  {
    heading: "Product",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/docs", label: "Docs" },
      { href: "/merchant", label: "Merchant" },
    ],
  },
  {
    heading: "Company",
    links: [{ href: "/about", label: "About" }],
  },
  {
    heading: "Legal",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-ink/5 bg-white">
      <Container className="grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div className="max-w-xs">
          <Wordmark variant="dark" className="h-9 w-auto" />
          <p className="mt-4 text-sm leading-relaxed text-slate">
            Real ownership, delivered at checkout. No wallet to set up, no
            broker to call.
          </p>
        </div>

        {columns.map((column) => (
          <div key={column.heading}>
            <p className="text-sm font-medium text-ink">{column.heading}</p>
            <ul className="mt-4 space-y-3">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate transition-colors hover:text-equixity-deep"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>

      <Container className="flex flex-col gap-2 border-t border-ink/5 py-6 text-xs text-slate sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Equixity. All rights reserved.</p>
        <p>Tokenized equity, delivered to a wallet you actually hold.</p>
      </Container>
    </footer>
  );
}
