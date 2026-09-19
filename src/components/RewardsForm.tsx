"use client";

import { useState } from "react";
import { AssetTable, type AssetRow } from "@/components/AssetTable";

/**
 * Rewards configuration form (spec sections 1, 6a, 7).
 *
 * Asset selection is the shared FILTERABLE TABLE (spec section 1). The
 * receiving wallet and the checkout snippet live on the Settings page —
 * configuration, not reward tuning.
 *
 * The section 6a merchant attestation gates the rewards toggle in the UI, but
 * the REAL enforcement is server-side: the settings API refuses
 * `is_enabled: true` without the attestation AND a receiving wallet on record.
 *
 * The 0.01%-20% bound is enforced here for UX and again via Zod + the DB CHECK
 * constraint (the DB is the gate that actually matters). The rate is stored as
 * basis points internally; the UI only ever presents a percentage.
 */

const ELIGIBILITY_TEXT =
  "I confirm my business does not primarily serve customers in the United States, " +
  "United Kingdom, Canada, Australia, or any OFAC-sanctioned jurisdiction.";

/** 100 bps -> "1", 150 bps -> "1.5", 25 bps -> "0.25". */
function bpsToPercentString(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fracHundredths = bps % 100;
  if (fracHundredths === 0) {
    return String(whole);
  }
  return `${whole}.${String(fracHundredths).padStart(2, "0").replace(/0+$/, "")}`;
}

/**
 * Parse a percentage string ("1", "1.5", "0.25") into integer basis points
 * (1-2000). Integer math only — at most 2 decimals, because bps are whole
 * hundredths of a percent. Throws with a user-facing message on bad input.
 */
function percentToBps(input: string): number {
  const s = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    throw new Error("Enter a percentage between 0.01% and 20%.");
  }
  const [whole, frac = ""] = s.split(".");
  const hundredths = parseInt(frac.padEnd(2, "0"), 10);
  const bps = parseInt(whole, 10) * 100 + hundredths;
  if (bps < 1 || bps > 2000) {
    throw new Error("Percentage must be between 0.01% and 20%.");
  }
  return bps;
}

export function RewardsForm({
  assets,
  initialAsset,
  initialBps,
  initialEnabled,
  initialEligibilityConfirmed,
}: {
  assets: AssetRow[];
  initialAsset: string;
  initialBps: number;
  initialEnabled: boolean;
  initialEligibilityConfirmed: boolean;
}) {
  const [asset, setAsset] = useState(initialAsset);
  const [percent, setPercent] = useState(bpsToPercentString(initialBps));
  const [enabled, setEnabled] = useState(initialEnabled);
  const [eligibilityConfirmed, setEligibilityConfirmed] = useState(
    initialEligibilityConfirmed,
  );
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    let bps;
    try {
      bps = percentToBps(percent);
    } catch (e) {
      setStatus({ kind: "error", text: (e as Error).message });
      return;
    }

    if (enabled && !eligibilityConfirmed) {
      setStatus({
        kind: "error",
        text: "Confirm the eligibility statement before enabling rewards.",
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
          reward_asset: asset,
          reward_bps: bps,
          is_enabled: enabled,
          confirmed_customer_eligibility: eligibilityConfirmed,
        }),
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

      <div className="mt-4">
        <p className="text-sm font-medium text-gray-700">Reward asset</p>
        <p className="mb-2 text-xs text-gray-500">
          Pick the asset your customers receive. Filter by category, then select one.
        </p>
        <AssetTable
          assets={assets}
          selectable
          selectedTicker={asset}
          onSelect={setAsset}
        />
      </div>

      <label className="mt-4 block text-sm font-medium text-gray-700">
        Reward percentage
        <input
          type="number"
          min={0.01}
          max={20}
          step={0.01}
          required
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <span className="text-xs text-gray-400">
          Between 0.01% and 20%. Default 1%.
        </span>
      </label>

      {/* --- Section 6a merchant attestation --------------------------------- */}
      <div className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4">
        <label className="flex items-start gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={eligibilityConfirmed}
            onChange={(e) => setEligibilityConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          <span>{ELIGIBILITY_TEXT}</span>
        </label>
        <p className="mt-2 text-xs text-gray-500">
          Required before rewards can be enabled. xStocks and PreStocks are
          restricted for persons in those jurisdictions, so this is enforced
          server-side as well as here.
        </p>
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={!eligibilityConfirmed && !enabled}
          onClick={() => setEnabled(!enabled)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            enabled ? "bg-green-600" : "bg-gray-300"
          } ${!eligibilityConfirmed && !enabled ? "cursor-not-allowed opacity-50" : ""}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              enabled ? "translate-x-5" : ""
            }`}
          />
        </button>
        <span className="text-sm font-medium text-gray-700">
          {enabled ? "Rewards enabled" : "Rewards disabled"}
        </span>
      </label>
      <p className="text-xs text-gray-400">
        {eligibilityConfirmed
          ? "Turn rewards off to stop your customers from earning while you pause promotions or stop using Equixity. Your asset and rate are kept."
          : "Tick the eligibility statement above AND set your receiving wallet (Settings → Configuration) to enable rewards."}
      </p>

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

    </div>
  );
}