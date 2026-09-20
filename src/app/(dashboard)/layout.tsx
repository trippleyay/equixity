import { requireDashboardMerchant } from "@/lib/auth/require-dashboard";
import { Sidebar } from "@/components/Sidebar";
import type { ReactNode } from "react";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { merchant } = await requireDashboardMerchant();

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-equixity-mist/50 via-gray-50 to-gray-50 md:flex-row">
      <Sidebar merchantName={merchant.name} />
      <main className="w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 md:py-8 lg:px-10">
        {children}
      </main>
    </div>
  );
}