"use client";

import { useState, type ReactNode } from "react";
import { CodeField } from "@/components/CodeField";
import { SuccessPageSnippet } from "@/components/SuccessPageSnippet";
import {
  SetupActions,
  SetupProgress,
  SetupStep,
  type WebhookStatus,
} from "@/components/SetupGuide";

/**
 * Stripe tab of Settings → Configuration: four steps, each a single paste or a
 * single click in Stripe, with the shared success-page snippet last. Step 2 is
 * the only interactive one and Next stays disabled until a signing secret is
 * stored, so nobody walks to the end believing they are done when they are not.
 */

const TOTAL_STEPS = 4;
const SESSION_ID = "?session_id={CHECKOUT_SESSION_ID}";
const SESSION_ID_APPEND = "&session_id={CHECKOUT_SESSION_ID}";

/** Bold term inside a sentence, without shouting. */
function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-ink">{children}</span>;
}

export function StripeSetupPanel({
  webhookUrl,
  snippet,
  initialStatus,
  onStatusChange,
}: {
  webhookUrl: string;
  snippet: string;
  initialStatus: WebhookStatus;
  onStatusChange: (status: WebhookStatus) => void;
}) {
  const [step, setStep] = useState(1);
  const [secret, setSecret] = useState("");
  const [configured, setConfigured] = useState(initialStatus.configured);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNow, setSavedNow] = useState(false);

  async function saveSecret() {
    const value = secret.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/fiat-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookSecret: value, provider: "stripe" }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        updatedAt?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not save the signing secret. Please try again.");
        return;
      }
      setConfigured(true);
      setSavedNow(true);
      setSecret("");
      onStatusChange({
        configured: true,
        updatedAt: body.updatedAt ?? new Date().toISOString(),
      });
    } catch {
      setError("Could not save the signing secret. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const lastStep = step === TOTAL_STEPS;

  return (
    <div>
      <SetupProgress step={step} total={TOTAL_STEPS} />

      {step === 1 ? (
        <SetupStep title="Add the Equixity web address in Stripe">
          <p className="mt-2 text-sm text-slate">
            In Stripe, open <Strong>Developers</Strong>, then{" "}
            <Strong>Webhooks</Strong>, then <Strong>Add endpoint</Strong>. Paste
            this web address as the endpoint URL:
          </p>
          <CodeField value={webhookUrl} label="Copy web address" />
        </SetupStep>
      ) : null}

      {step === 2 ? (
        <SetupStep title="Turn on the paid event, then paste the signing secret">
          <p className="mt-2 text-sm text-slate">
            Under <Strong>Events</Strong>, select{" "}
            <code className="text-xs">checkout.session.completed</code>, then
            click <Strong>Add endpoint</Strong>. Stripe shows a signing secret
            that starts with <code className="text-xs">whsec_</code>. Paste it
            here:
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="whsec_..."
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-equixity"
            />
            <button
              type="button"
              onClick={saveSecret}
              disabled={busy || secret.trim() === ""}
              className="shrink-0 rounded-full bg-equixity px-4 py-2 text-sm font-medium text-white transition hover:bg-equixity-deepDark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Saving..." : configured ? "Replace secret" : "Save secret"}
            </button>
          </div>
          {error ? (
            <p className="mt-2 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {configured ? (
            <p className="mt-2 text-sm text-emerald-700">
              {savedNow
                ? "Saved. Your signing secret is stored securely."
                : "Your signing secret is already saved."}
            </p>
          ) : null}
        </SetupStep>
      ) : null}

      {step === 3 ? (
        <SetupStep title="Send paying customers back to your page">
          <p className="mt-2 text-sm text-slate">
            In Stripe, open the payment link or checkout you use and set the
            address customers return to after paying. It has to end with:
          </p>
          <CodeField value={SESSION_ID} />
          <p className="mt-3 text-sm text-slate">
            Already ends like that? Change nothing.
          </p>
          <p className="mt-3 text-sm text-slate">
            Only if that address already contains a question mark, use this
            instead:
          </p>
          <CodeField value={SESSION_ID_APPEND} />
        </SetupStep>
      ) : null}

      {step === 4 ? (
        <SetupStep title="Paste the snippet on your thank-you page">
          <p className="mt-2 text-sm text-slate">
            This is the page Stripe sends customers to after they pay. Paste the
            snippet once:
          </p>
          <SuccessPageSnippet snippet={snippet} />
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-900">All set.</p>
            <p className="mt-1 text-xs leading-5 text-emerald-800">
              Stripe card payments now create a reward for your customers, with
              nothing else to build.
            </p>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate">
            Only USD charges create a reward. Any other currency is refused
            instead of converted.
          </p>
        </SetupStep>
      ) : null}

      <SetupActions
        onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
        onNext={lastStep ? undefined : () => setStep((s) => s + 1)}
        nextDisabled={step === 2 && !configured}
      />
    </div>
  );
}
