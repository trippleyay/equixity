"use client";

import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";

/**
 * Fiat Path A setup (reward-delivery spec section 5): the merchant pastes one
 * URL into Stripe and pastes one secret back. Written in merchant language —
 * the whole integration is two copy-paste actions, no code anywhere.
 */
export function FiatWebhookPanel({
  webhookUrl,
  initialConfigured,
  initialUpdatedAt,
}: {
  webhookUrl: string;
  initialConfigured: boolean;
  initialUpdatedAt: string | null;
}) {
  const [configured, setConfigured] = useState(initialConfigured);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/merchant/fiat-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookSecret: secret.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not save the secret. Please try again.");
        return;
      }
      setConfigured(true);
      setUpdatedAt(json.updatedAt ?? new Date().toISOString());
      setSecret("");
      setMessage("Saved. Your card rewards are set up.");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/merchant/fiat-webhook", { method: "DELETE" });
      if (!res.ok) {
        setError("Could not remove the secret. Please try again.");
        return;
      }
      setConfigured(false);
      setUpdatedAt(null);
      setMessage(
        "Removed. Card rewards are switched off until you set it up again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 rounded-2xl border border-ink/5 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">
          Card payments (Stripe)
        </h2>
        {configured ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
            Set up
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            Not set up yet
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Let customers pay with a card and still earn rewards. Two copy-paste
        steps, no code.
      </p>

      <ol className="mt-4 space-y-3 text-sm text-ink">
        <li>
          <span className="font-medium">1.</span> In Stripe, go to{" "}
          <span className="font-medium">Developers</span>, then{" "}
          <span className="font-medium">Webhooks</span>, then{" "}
          <span className="font-medium">Add endpoint</span>.
        </li>
        <li>
          <span className="font-medium">2.</span> Paste this web address as the
          endpoint URL:
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 break-all rounded-xl bg-equixity-mist/70 px-3 py-1.5 text-xs">
              {webhookUrl}
            </code>
            <CopyButton value={webhookUrl} label="Copy web address" />
          </div>
        </li>
        <li>
          <span className="font-medium">3.</span> Under events, select{" "}
          <span className="font-medium">checkout.session.completed</span>.
        </li>
        <li>
          <span className="font-medium">4.</span> Click Add endpoint, then copy
          the signing secret Stripe shows you (it starts with{" "}
          <code className="text-xs">whsec_</code>) and paste it here:
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Paste the signing secret (starts with whsec_)"
              autoComplete="off"
              disabled={busy}
              className="min-w-0 flex-1 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-equixity"
            />
            <button
              type="button"
              onClick={save}
              disabled={busy || secret.trim() === ""}
              className="rounded-full bg-equixity px-4 py-2 text-sm font-medium text-white transition hover:bg-equixity-deepDark disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save secret
            </button>
          </div>
        </li>
      </ol>

      {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {configured && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-ink/5 pt-4">
          <p className="text-xs text-slate">
            {updatedAt
              ? `Last updated ${new Date(updatedAt).toLocaleString()}.`
              : null}{" "}
            The secret is stored securely and never shown again. To change it,
            paste a new one and save.
          </p>
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="rounded-full border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
          >
            Remove secret
          </button>
        </div>
      )}

      <p className="mt-4 border-t border-ink/5 pt-4 text-xs text-slate">
        Building your own checkout backend instead? Use the API key in the panel
        next to this one and skip the steps above.
      </p>
    </div>
  );
}

