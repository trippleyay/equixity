"use client";

import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";

type AssetOption = {
  ticker: string;
  display_name: string;
  decimals: number;
};

/**
 * Rewards configuration form (spec section 7). Saves via POST
 * /api/merchant/settings. The 0.01%–20% (1–2000 bps) bound is enforced here for
 * UX and again via Zod + the DB CHECK constraint (the DB is the gate that
 * actually matters).
 */
export function RewardsForm({
  assets,
  initialAsset,
  initialBps,
  sdkSnippet,
}: {
  assets: AssetOption[];
  initialAsset: string;
  initialBps: number;
  sdkSnippet: string;
}) {
  const [asset, setAsset] = useState(initialAsset);
  const [bps, setBps] = useState(initialBps);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/merchant/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reward_asset: asset, reward_bps: bps }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus({ kind: "error", text: body.error ?? "Failed to save." });
        return;
      }
      setStatus({ kind: "ok", text: "Settings saved." });
    } catch (e) {
      setStatus({ kind: "error", text: `Unexpected error: ${e}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-700">Reward configuration</h2>

      <label className="mt-4 block text-sm font-medium text-gray-700">
        Reward asset
        <select
          value={asset}
          onChange={(e) => setAsset(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          {assets.map((a) => (
            <option key={a.ticker} value={a.ticker}>
              {a.display_name} ({a.ticker})
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm font-medium text-gray-700">
        Reward percentage (basis points)
        <input
          type="number"
          min={1}
          max={2000}
          required
          value={bps}
          onChange={(e) => setBps(parseInt(e.target.value, 10))}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <span className="text-xs text-gray-400">
          Between 1 and 2000 bps (0.01%–20%). Default 100 bps (1%).
        </span>
      </label>

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>

      {status && (
        <p
          className={`mt-2 rounded px-3 py-2 text-sm ${
            status.kind === "ok"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {status.text}
        </p>
      )}

      <div className="mt-6 border-t border-gray-200 pt-4">
        <h2 className="text-sm font-semibold text-gray-700">
          Checkout snippet
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Paste this into your checkout. It carries only your merchant ID.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-gray-100 p-3 text-xs leading-5">
          <code>{sdkSnippet}</code>
        </pre>
        <div className="mt-2">
          <CopyButton value={sdkSnippet} label="Copy snippet" />
        </div>
      </div>
    </div>
  );
}