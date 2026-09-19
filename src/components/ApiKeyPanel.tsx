"use client";

import { useState } from "react";

/**
 * Merchant API key management UI (spec section 4a).
 *
 * The plaintext key is shown EXACTLY ONCE, immediately after generation, and the
 * UI says so plainly. Afterwards only the last four characters are ever
 * available — the server does not store the key itself, only its hash, so there
 * is nothing to reveal later.
 *
 * "Regenerate" replaces the key immediately: there is no dual-key grace period in
 * this build, so the old key stops working the moment a new one is generated.
 */
export function ApiKeyPanel({
  initialHasKey,
  initialLastFour,
}: {
  initialHasKey: boolean;
  initialLastFour: string | null;
}) {
  const [hasKey, setHasKey] = useState(initialHasKey);
  const [lastFour, setLastFour] = useState(initialLastFour);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (
      hasKey &&
      !window.confirm(
        "Generating a new key immediately invalidates the current one. Continue?",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/api-key", { method: "POST" });
      const body = (await res.json()) as {
        api_key?: string;
        last_four?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not generate a key.");
        return;
      }
      setRevealed(body.api_key ?? null);
      setHasKey(true);
      setLastFour(body.last_four ?? null);
    } catch {
      setError("Could not generate a key.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
    } catch {
      // Clipboard may be unavailable; the key is visible on screen regardless.
    }
  }

  return (
    <div className="mt-6 max-w-xl rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-700">API key</h2>
      <p className="mt-1 text-xs text-gray-500">
        For merchants on Stripe, Shopify, or any card checkout: your backend calls
        Equixity with this key to report completed orders. It is separate from your
        dashboard login.
      </p>

      {revealed ? (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-900">
            Copy this key now — it will not be shown again.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-white px-2 py-1 font-mono text-xs">
              {revealed}
            </code>
            <button
              type="button"
              onClick={copy}
              className="rounded border border-amber-400 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              Copy
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-600">
          {hasKey
            ? `Key ending in ${lastFour ?? "····"}`
            : "No API key has been generated yet."}
        </p>
      )}

      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Generating…" : hasKey ? "Regenerate API key" : "Generate API key"}
      </button>

      {hasKey ? (
        <p className="mt-2 text-xs text-gray-400">
          Regenerating invalidates the current key immediately.
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="mt-4 border-t border-gray-200 pt-3">
        <p className="text-xs font-medium text-gray-600">Reporting a completed order</p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-gray-100 p-3 text-[11px] leading-5">
          <code>{`curl -X POST https://YOUR_APP/api/public/complete-card \\
  -H "Authorization: Bearer <api_key>" \\
  -H "Content-Type: application/json" \\
  -d '{"purchaseAmountUsd": 42.00, "externalOrderId": "order_1234"}'`}</code>
        </pre>
        <p className="mt-2 text-xs text-gray-500">
          `externalOrderId` must be unique per order — it is the idempotency guard,
          so retries never issue a duplicate reward.
        </p>
      </div>
    </div>
  );
}