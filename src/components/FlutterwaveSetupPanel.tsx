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
 * Flutterwave tab of Settings → Configuration.
 *
 * The merchant never invents anything: we generate the secret hash and show it,
 * they paste it into Flutterwave, then paste the same shared snippet at the end.
 * Flutterwave is told to keep every event box ticked because we only act on
 * successful USD charges and acknowledge everything else.
 */

const TOTAL_STEPS = 3;

/** Bold term inside a sentence, without shouting. */
function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-ink">{children}</span>;
}

/** A fresh secret hash: 32 random bytes as hex, which is what we store. */
function generateSecretHash(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function FlutterwaveSetupPanel({
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
  const [configured, setConfigured] = useState(initialStatus.configured);
  const [secretHash, setSecretHash] = useState<string | null>(() =>
    initialStatus.configured ? null : generateSecretHash(),
  );
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNow, setSavedNow] = useState(false);

  async function saveSecretHash() {
    if (!secretHash) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/fiat-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookSecret: secretHash, provider: "flutterwave" }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        updatedAt?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not save the secret hash. Please try again.");
        return;
      }
      setConfigured(true);
      setReplacing(false);
      setSavedNow(true);
      onStatusChange({
        configured: true,
        updatedAt: body.updatedAt ?? new Date().toISOString(),
      });
    } catch {
      setError("Could not save the secret hash. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function startReplacing() {
    setSecretHash(generateSecretHash());
    setReplacing(true);
    setSavedNow(false);
    setError(null);
  }

  const lastStep = step === TOTAL_STEPS;
  const showHash = !configured || replacing;

  return (
    <div>
      <SetupProgress step={step} total={TOTAL_STEPS} />

      {step === 1 ? (
        <SetupStep title="Add the Equixity web address in Flutterwave">
          <p className="mt-2 text-sm text-slate">
            In Flutterwave, open <Strong>Settings</Strong>, then{" "}
            <Strong>Webhooks</Strong>. Paste this web address as the webhook URL
            and leave every event box ticked:
          </p>
          <CodeField value={webhookUrl} label="Copy web address" />
          <p className="mt-3 text-xs leading-5 text-slate">
            Leaving every box ticked is safe: only successful USD charges create
            a reward, and everything else is acknowledged and ignored.
          </p>
        </SetupStep>
      ) : null}

      {step === 2 ? (
        <SetupStep title="Paste your secret hash">
          {showHash ? (
            <>
              <p className="mt-2 text-sm text-slate">
                In the same Flutterwave webhook settings, paste this into the{" "}
                <Strong>Secret hash</Strong> field and click Save there. It is
                already made for you, so there is nothing to invent.
              </p>
              <CodeField value={secretHash ?? ""} label="Copy secret hash" />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={saveSecretHash}
                  disabled={busy}
                  className="rounded-full bg-equixity px-4 py-2 text-sm font-medium text-white transition hover:bg-equixity-deepDark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Saving..." : "Save secret hash"}
                </button>
                {replacing ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReplacing(false);
                      setError(null);
                    }}
                    className="text-xs font-medium text-slate transition hover:text-ink"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate">
                Save it here as well, otherwise Flutterwave payments stop being
                verified. Lost the value? Make a new one from this screen.
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate">
                Your secret hash is saved and Flutterwave payments are being
                verified.
              </p>
              {savedNow ? (
                <p className="mt-2 text-sm text-emerald-700">
                  Saved. Paste the same value into Flutterwave if you have not
                  already.
                </p>
              ) : null}
              <button
                type="button"
                onClick={startReplacing}
                className="mt-3 text-xs font-medium text-equixity underline-offset-2 transition hover:underline"
              >
                Use a new secret hash
              </button>
            </>
          )}
          {error ? (
            <p className="mt-2 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </SetupStep>
      ) : null}

      {step === 3 ? (
        <SetupStep title="Paste the snippet on your thank-you page">
          <p className="mt-2 text-sm text-slate">
            This is the page Flutterwave sends customers to after they pay. Paste
            the snippet once:
          </p>
          <SuccessPageSnippet snippet={snippet} />
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-900">All set.</p>
            <p className="mt-1 text-xs leading-5 text-emerald-800">
              Flutterwave card payments now create a reward for your customers,
              with nothing else to build.
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
