"use client";

import { useState } from "react";

/**
 * Merchant API key management UI (spec section 4a), shown in
 * Settings → Configuration as a table: created date, last four, status, and a
 * Delete action that revokes the key server-side.
 *
 * The plaintext key is shown EXACTLY ONCE, immediately after generation, and
 * the UI says so plainly. Afterwards only the last four characters are ever
 * available — the server stores only the hash, so there is nothing to reveal
 * later. One key max per merchant; regenerate/delete take effect immediately.
 */

type KeyState = {
  hasKey: boolean;
  lastFour: string | null;
  createdAt: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function ApiKeyPanel({
  initialHasKey,
  initialLastFour,
  initialCreatedAt,
  baseUrl,
}: {
  initialHasKey: boolean;
  initialLastFour: string | null;
  initialCreatedAt: string | null;
  baseUrl: string;
}) {
  const [state, setState] = useState<KeyState>({
    hasKey: initialHasKey,
    lastFour: initialLastFour,
    createdAt: initialCreatedAt,
  });
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (
      state.hasKey &&
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
        created_at?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not generate a key.");
        return;
      }
      setRevealed(body.api_key ?? null);
      setState({
        hasKey: true,
        lastFour: body.last_four ?? null,
        createdAt: body.created_at ?? new Date().toISOString(),
      });
    } catch {
      setError("Could not generate a key.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        "Delete this API key? Any integration using it stops working immediately.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/api-key", { method: "DELETE" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not delete the key.");
        return;
      }
      setRevealed(null);
      setState({ hasKey: false, lastFour: null, createdAt: null });
    } catch {
      setError("Could not delete the key.");
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
    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-700">Fiat checkout API</h2>
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
      ) : null}

      <table className="mt-4 w-full text-left text-sm">
        <thead className="border-b border-gray-200 text-xs text-gray-500">
          <tr>
            <th className="py-2 font-medium">Key</th>
            <th className="py-2 font-medium">Created</th>
            <th className="py-2 font-medium">Status</th>
            <th className="py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {state.hasKey ? (
            <tr className="border-b border-gray-100">
              <td className="py-3 font-mono text-xs text-gray-800">
                eqx_••••{state.lastFour ?? "····"}
              </td>
              <td className="py-3 text-xs text-gray-600">
                {formatDate(state.createdAt)}
              </td>
              <td className="py-3">
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                  Active
                </span>
              </td>
              <td className="py-3 text-right">
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy}
                  className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Regenerate
                </button>{" "}
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
              </td>
            </tr>
          ) : (
            <tr className="border-b border-gray-100">
              <td className="py-3 text-xs text-gray-500" colSpan={3}>
                No API key generated yet.
              </td>
              <td className="py-3 text-right">
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy}
                  className="rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {busy ? "Working…" : "Generate API key"}
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {state.hasKey ? (
        <p className="mt-2 text-xs text-gray-400">
          Regenerating or deleting takes effect immediately — there is no grace
          period.
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="mt-4 border-t border-gray-200 pt-3">
        <p className="text-xs font-medium text-gray-600">Reporting a completed order</p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-gray-100 p-3 text-[11px] leading-5">
          <code>{`curl -X POST ${baseUrl}/api/public/complete-card \\
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
