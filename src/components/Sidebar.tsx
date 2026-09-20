"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: "grid" },
  { href: "/rewards", label: "Rewards", icon: "gift" },
  { href: "/funding", label: "Funding", icon: "wallet" },
  { href: "/settings", label: "Settings", icon: "cog" },
] as const;

function NavIcon({ name }: { name: (typeof NAV_ITEMS)[number]["icon"] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "grid":
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
        </svg>
      );
    case "gift":
      return (
        <svg {...common}>
          <rect x="3.5" y="8" width="17" height="4" rx="1.5" />
          <path d="M5 12v7.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V12" />
          <path d="M12 8v13" />
          <path d="M12 8s-4.5.3-4.5-2.4C7.5 3.9 10.8 4 12 8Z" />
          <path d="M12 8s4.5.3 4.5-2.4C16.5 3.9 13.2 4 12 8Z" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z" />
          <path d="M15 12h5" />
          <circle cx="15.5" cy="12" r="0.5" fill="currentColor" />
        </svg>
      );
    case "cog":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18.2 5.8l-1.4 1.4M7.2 16.8l-1.4 1.4M18.2 18.2l-1.4-1.4M7.2 7.2 5.8 5.8" />
        </svg>
      );
  }
}

/**
 * Dashboard sidebar — deep-purple brand panel (theme pulled from the landing
 * page's hero sky). White wordmark, no "Equixity" text: the logo image carries
 * the name. Active item is a translucent white pill; icons are inline SVG
 * strokes so they inherit the text color.
 */
export function Sidebar({ merchantName }: { merchantName: string }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-y-auto bg-gradient-to-b from-equixity-deep via-[#5b1170] to-[#420b53]">
      <div className="px-6 pt-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/equixity-wordmark-light.svg"
          alt="Equixity"
          className="h-6 w-auto"
        />
        <div className="mt-1.5 text-[11px] font-medium tracking-wide text-white/50">
          Merchant
        </div>
      </div>

      <p className="px-6 pt-9 pb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
        Menu
      </p>
      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition ${
                active
                  ? "bg-white/15 font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "font-medium text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className={active ? "text-white" : "text-white/60"}>
                <NavIcon name={item.icon} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-white/10 px-6 py-4">
        <p className="mb-1 truncate text-sm font-medium text-white/85">
          {merchantName}
        </p>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-left text-xs font-medium text-white/50 transition hover:text-white"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}