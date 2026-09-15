"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/rewards", label: "Rewards" },
  { href: "/funding", label: "Funding" },
  { href: "/account", label: "Account" },
];

export function Sidebar({ merchantName }: { merchantName: string }) {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-gray-200 bg-white">
      <div className="px-4 py-5">
        <div className="text-lg font-bold tracking-tight text-gray-900">
          Equixity
        </div>
        <div className="text-xs text-gray-400">Merchant</div>
      </div>
      <nav className="flex flex-col gap-1 px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                active
                  ? "bg-gray-900 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-6 border-t border-gray-200 px-4 py-3">
        <p className="mb-1 truncate text-sm font-medium text-gray-800">
          {merchantName}
        </p>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-left text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}