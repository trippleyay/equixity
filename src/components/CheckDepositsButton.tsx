"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Check for new deposits" button (spec section 5): calls the same funding
 * endpoint a page load uses, then refreshes the page to show updated state.
 */
export function CheckDepositsButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    try {
      await fetch("/api/merchant/funding", { cache: "no-store" });
    } catch {
      // Errors surface via the page's own rendering; refresh regardless.
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={check}
      disabled={busy || disabled}
      className="rounded-full bg-equixity-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-equixity-deepDark disabled:opacity-50"
    >
      {busy ? "Checking…" : "Check for new deposits"}
    </button>
  );
}