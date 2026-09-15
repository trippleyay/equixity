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
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar merchantName={merchant.name} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 lg:px-10">
        {children}
      </main>
    </div>
  );
}