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
 *
 * Step 2 stores the secret hash, which is what makes the webhook verifiable, so
 * Next cannot be walked past without it. Done on the last step re-reads the
 * stored hash from the server, refuses if nothing was stored, and on success
 * marks the path set up and shows the finished view.
 *
 * Nothing here is one-time. Saving is an upsert on (merchant, provider), so the
 * guide can be re-run whenever something changes on the Flutterwave side: make a
 * new hash in step 2, or remove the stored hash to start the path over.
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
  const [finishing, setFinishing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [finished, setFinished] = useState(false);
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

  /** Done: confirm against the stored hash, then close the guide out. */
  async function done() {
    setFinishing(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/fiat-webhook?provider=flutterwave");
      const body = (await res.json().catch(() => ({}))) as {
        configured?: boolean;
        updatedAt?: string | null;
      };
      if (!res.ok || !body.configured) {
        setError(
          "No secret hash is saved yet. Go back to step 2 and save the hash shown there.",
        );
        return;
      }
      setConfigured(true);
      setSavedNow(false);
      setFinished(true);
      onStatusChange({ configured: true, updatedAt: body.updatedAt ?? null });
    } catch {
      setError("Could not confirm the setup right now. Please try again.");
    } finally {
      setFinishing(false);
    }
  }

  /** Remove the stored hash, so the path can be set up again from scratch. */
  async function removeSecretHash() {
    if (
      !window.confirm(
        "Remove the saved secret hash? Flutterwave payments stop creating rewards until you save a new one.",
      )
    ) {
      return;
    }
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/fiat-webhook?provider=flutterwave", {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not remove the secret hash. Please try again.");
        return;
      }
      setConfigured(false);
      setReplacing(false);
      setSavedNow(false);
      setFinished(false);
      setSecretHash(generateSecretHash());
      onStatusChange({ configured: false, updatedAt: null });
    } catch {
      setError("Could not remove the secret hash. Please try again.");
    } finally {
      setRemoving(false);
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

  if (finished) {
    return (
      <div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">All set.</p>
          <p className="mt-1 text-xs leading-5 text-emerald-800">
            Flutterwave card payments now create a reward for your customers,
            with nothing else to build. Only USD charges create a reward.
          </p>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate">
          Keep this snippet on the page Flutterwave sends customers to after they
          pay:
        </p>
        <SuccessPageSnippet snippet={snippet} />
        <SetupActions
          onBack={() => {
            setFinished(false);
            setStep(1);
          }}
          backLabel="Review the steps"
        />
      </div>
    );
  }

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
              <p className="mt-3 text-xs leading-5 text-slate">
                Changed something in Flutterwave, or want to start this path
                over? Make a new hash and save it, or remove the saved one and
                set the path up again.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={startReplacing}
                  className="text-xs font-medium text-equixity underline-offset-2 transition hover:underline"
                >
                  Use a new secret hash
                </button>
                <button
                  type="button"
                  onClick={removeSecretHash}
                  disabled={removing}
                  className="text-xs font-medium text-slate underline-offset-2 transition hover:text-ink hover:underline disabled:opacity-50"
                >
                  {removing ? "Removing..." : "Remove the saved hash"}
                </button>
              </div>
            </>
          )}
        </SetupStep>
      ) : null}

      {step === 3 ? (
        <SetupStep title="Paste the snippet on your thank-you page">
          <p className="mt-2 text-sm text-slate">
            This is the page Flutterwave sends customers to after they pay. Paste
            the snippet once:
          </p>
          <SuccessPageSnippet snippet={snippet} />
          <p className="mt-4 text-xs leading-5 text-slate">
            Only USD charges create a reward. Any other currency is refused
            instead of converted. Press Done when you are finished, and we will
            check that your secret hash is saved.
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
        onNext={lastStep ? done : () => setStep((s) => s + 1)}
        nextLabel={lastStep ? "Done" : "Next"}
        nextDisabled={step === 2 && !configured}
        nextBusy={finishing}
      />
    </div>
  );
}
