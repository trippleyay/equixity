"use client";

import { useState } from "react";

/**
 * The Solana wallet the merchant's checkout actually pays into (spec section
 * 1). Lives on Settings → Configuration, not on Rewards — purchase
 * verification reads it server-side on every completion call.
 *
 * The settings POST body is a full settings object, so the save echoes the
 * merchant's current reward values (passed in as props) unchanged and sends
 * only the wallet as the delta. Server-side validation is authoritative: the
 * service layer checks `new PublicKey(...)` and refuses to clear the wallet
 * while rewards are enabled.
 */

const WALLET_INFO =
  "This is the Solana wallet your checkout actually sends customer payments " +
  "to. Equixity checks every purchase against this address to confirm it's " +
  "real before issuing a reward — enter the wallet your payment processor " +
  "pays out to, not a personal or unrelated wallet.";

export function ReceivingWalletForm({
  initialWallet,
  currentAsset,
  currentBps,
  currentEnabled,
  currentEligibilityConfirmed,
}: {
  initialWallet: string | null;
  currentAsset: string;
  currentBps: number;
  currentEnabled: boolean;
  currentEligibilityConfirmed: boolean;
}) {
  const [wallet, setWallet] = useState(initialWallet ?? "");
  const [busy, setBusy] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );

  async function save() {
    const trimmed = wallet.trim();
    // Cheap pre-flight; the server's `new PublicKey(...)` check is the real gate.
    if (trimmed !== "" && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
      setStatus({
        kind: "error",
        text: "Receiving wallet must be a well-formed base58 Solana address.",
      });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/merchant/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reward_asset: currentAsset,
          reward_bps: currentBps,
          is_enabled: currentEnabled,
          confirmed_customer_eligibility: currentEligibilityConfirmed,
          receiving_wallet_address: trimmed,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatus({ kind: "error", text: body.error ?? "Failed to save." });
        return;
      }
      setStatus({ kind: "ok", text: "Receiving wallet saved." });
    } catch (e) {
      setStatus({ kind: "error", text: `Unexpected error: ${e}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-700">Receiving wallet</h2>
      <p className="mt-1 text-xs text-gray-500">
        The Solana wallet your checkout pays into.
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          className="ml-2 text-xs font-medium text-gray-500 underline hover:text-gray-700"
        >
          What is this?
        </button>
      </p>
      {showInfo ? (
        <p className="mt-2 rounded-md bg-blue-50 p-3 text-xs text-blue-900">
          {WALLET_INFO}
        </p>
      ) : null}
      <input
        type="text"
        value={wallet}
        onChange={(e) => setWallet(e.target.value)}
        placeholder="The Solana wallet your checkout pays into"
        className="mt-3 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs"
      />
      <p className="mt-1 text-xs text-gray-400">
        Required for Solana checkout verification (fiat merchants do not need
        one). Editable at any time
        — changes apply to future purchases only.
      </p>
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save wallet"}
      </button>
      {status ? (
        <p
          className={`mt-2 rounded px-3 py-2 text-sm ${
            status.kind === "ok"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
