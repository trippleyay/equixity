// Stripe setup follows the dashboard sequence shown in the current Stripe UI:
// Developers -> Webhooks -> Add destination -> select events -> select
// checkout.session.completed -> choose Webhook endpoint -> configure destination
// with Your account, name, and endpoint URL -> Create destination -> copy secret.

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
 * single click in Stripe, and the shared success-page snippet last.
 *
 * Step 2 stores the signing secret, which is what makes the webhook verifiable,
 * so Next cannot be walked past without it. Done on the last step is the
 * merchant's explicit finish: it records the finish server-side (never from
 * local state), refuses if nothing was stored, and only then does the tab chip
 * read "Set up". A saved secret on its own reads "Finish setup".
 *
 * Nothing here is one-time. Saving is an upsert on (merchant, provider), so the
 * guide can be re-run whenever something changes on the Stripe side: paste a new
 * secret in step 2, or remove the stored secret to start the path over.
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
  const [finishing, setFinishing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [finished, setFinished] = useState(false);
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
        // A new secret means the path is mid-setup again until Done is pressed.
        completedAt: null,
      });
    } catch {
      setError("Could not save the signing secret. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Done: records the finish, which is what flips the tab chip to "Set up". The
   * server refuses while no signing secret is stored, so this cannot claim a
   * finished setup that does not exist.
   */
  async function done() {
    setFinishing(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/fiat-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "stripe", complete: true }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        configured?: boolean;
        updatedAt?: string | null;
        completedAt?: string | null;
        error?: string;
      };
      if (!res.ok || !body.configured) {
        setError(
          body.error ??
            "No signing secret is saved yet. Go back to step 2 and paste the one Stripe showed you.",
        );
        return;
      }
      setConfigured(true);
      setSavedNow(false);
      setFinished(true);
      onStatusChange({
        configured: true,
        updatedAt: body.updatedAt ?? null,
        completedAt: body.completedAt ?? null,
      });
    } catch {
      setError("Could not confirm the setup right now. Please try again.");
    } finally {
      setFinishing(false);
    }
  }

  /** Remove the stored secret, so the path can be set up again from scratch. */
  async function removeSecret() {
    if (
      !window.confirm(
        "Remove the saved signing secret? Stripe payments stop creating rewards until you paste a new one.",
      )
    ) {
      return;
    }
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/fiat-webhook?provider=stripe", {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          body.error ?? "Could not remove the signing secret. Please try again.",
        );
        return;
      }
      setConfigured(false);
      setSavedNow(false);
      setFinished(false);
      onStatusChange({ configured: false, updatedAt: null, completedAt: null });
    } catch {
      setError("Could not remove the signing secret. Please try again.");
    } finally {
      setRemoving(false);
    }
  }

  if (finished) {
    return (
      <div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">All set.</p>
          <p className="mt-1 text-xs leading-5 text-emerald-800">
            Stripe card payments now create a reward for your customers, with
            nothing else to build. Only USD charges create a reward.
          </p>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate">
          Keep this snippet on the page Stripe sends customers to after they pay:
        </p>
        <SuccessPageSnippet snippet={snippet} />
        <SetupActions
          onBack={() => {
            setFinished(false);
            setStep(1);
          }}
          backLabel="Update setup"
        />
      </div>
    );
  }

  return (
    <div>
      <SetupProgress step={step} total={TOTAL_STEPS} />

      {step === 1 ? (
        <SetupStep title="Create the Equixity destination in Stripe">
          <p className="mt-2 text-sm text-slate">
            In Stripe, open <Strong>Developers</Strong>, then{" "}
            <Strong>Webhooks</Strong>, then click <Strong>Add destination</Strong>.
            Under <Strong>Select events</Strong>, open <Strong>Checkout</Strong> and
            select <code className="text-xs">checkout.session.completed</code>.
            Click <Strong>Continue</Strong>.
          </p>
          <p className="mt-3 text-sm text-slate">
            Under <Strong>Choose destination type</Strong>, select{" "}
            <Strong>Webhook endpoint</Strong>, then click <Strong>Continue</Strong>.
            On the final screen, keep <Strong>Your account</Strong> selected, enter
            any destination name, and paste this web address into{" "}
            <Strong>Endpoint URL</Strong>:
          </p>
          <CodeField value={webhookUrl} label="Copy web address" />
          <p className="mt-3 text-sm text-slate">
            Click <Strong>Create destination</Strong>.
          </p>
        </SetupStep>
      ) : null}

      {step === 2 ? (
        <SetupStep title="Copy and save the signing secret">
          <p className="mt-2 text-sm text-slate">
            After the destination is created, return to the destination page. In
            <Strong>Destination details</Strong>, find <Strong>Signing secret</Strong>,
            reveal or copy the value beginning with <code className="text-xs">whsec_</code>,
            and paste it here:
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
          {configured ? (
            <div className="mt-2">
              <p className="text-sm text-emerald-700">
                {savedNow
                  ? "Saved. Your signing secret is stored securely."
                  : "Your signing secret is already saved."}
              </p>
              <button
                type="button"
                onClick={removeSecret}
                disabled={removing}
                className="mt-2 text-xs font-medium text-slate underline-offset-2 transition hover:text-ink hover:underline disabled:opacity-50"
              >
                {removing ? "Removing..." : "Remove the saved secret"}
              </button>
            </div>
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
          <p className="mt-4 text-xs leading-5 text-slate">
            Only USD charges create a reward. Any other currency is refused
            instead of converted.
          </p>
        </SetupStep>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <SetupActions
        onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
        onNext={step === TOTAL_STEPS ? done : () => setStep((s) => s + 1)}
        nextLabel={step === TOTAL_STEPS ? "Done" : "Next"}
        nextDisabled={step === 2 && !configured}
        nextBusy={finishing}
      />
    </div>
  );
}
