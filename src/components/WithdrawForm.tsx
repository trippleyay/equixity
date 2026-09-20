"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseUsdcToUnits } from "@/lib/format";

/**
 * Self-service withdraw form. Client converts the merchant's decimal input to
 * base-unit bigint (integer math, no floats) and POSTs it as a string; the
 * server re-validates, reserves the balance atomically, signs with the
 * merchant's own keypair, and broadcasts. Success/failure refreshes the page
 * so the balance and withdrawal history re-render from the server.
 */
export function WithdrawForm() {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setStatus(null);
    try {
      let units: bigint;
      try {
        units = parseUsdcToUnits(amount);
      } catch (e) {
        setStatus({ kind: "error", text: (e as Error).message });
        return;
      }

      const res = await fetch("/api/merchant/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_usdc_units: units.toString(),
          destination_address: destination.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus({ kind: "error", text: body.error ?? "Withdraw failed." });
        return;
      }
      const st = body.withdrawal?.status;
      setStatus({
        kind: st === "failed" ? "error" : "ok",
        text:
          st === "confirmed"
            ? "Withdrawal sent and confirmed."
            : st === "failed"
              ? body.withdrawal?.failure_reason ?? "Withdrawal failed."
              : `Withdrawal submitted (${st}).`,
      });
      setAmount("");
      setDestination("");
      router.refresh(); // re-render server: balance + history now reflect the row
    } catch (e) {
      setStatus({ kind: "error", text: `Unexpected error: ${e}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-ink/5 bg-white p-5 shadow-soft">
      <h2 className="text-sm font-semibold text-ink">Withdraw USDC</h2>
      <p className="mt-1 text-xs text-gray-500">
        Typically instant. High Solana network traffic may cause slight delays.
      </p>

      <label className="mt-4 block text-sm font-medium text-gray-700">
        Amount (USDC)
        <input
          type="text"
          inputMode="decimal"
          placeholder="1.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 block w-full rounded-full border border-gray-300 bg-white px-4 py-2 text-sm transition focus:border-equixity-deep focus:outline-none focus:ring-2 focus:ring-equixity-deep/25"
        />
      </label>

      <label className="mt-4 block text-sm font-medium text-gray-700">
        Destination address (Solana)
        <input
          type="text"
          placeholder="Paste the recipient's wallet address."
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          className="mt-1 block w-full break-all rounded-full border border-gray-300 bg-white px-4 py-2 font-mono text-sm transition focus:border-equixity-deep focus:outline-none focus:ring-2 focus:ring-equixity-deep/25"
        />
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-4 rounded-full bg-equixity-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-equixity-deepDark disabled:opacity-50"
      >
        {busy ? "Withdrawing…" : "Withdraw"}
      </button>

      {status && (
        <p
          className={`mt-2 rounded px-3 py-2 text-sm ${
            status.kind === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {status.text}
        </p>
      )}
    </div>
  );
}