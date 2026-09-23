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
 * they paste it into Flutterwave, and Next saves it here. There is no separate
 * save button because there is nothing for them to decide at that point.
 *
 * A fresh hash is generated on every visit, so if their hash ever changed in
 * Flutterwave they always have a new value to paste. Done on the last step is
 * what marks the path finished, which is what flips the tab chip to "Set up".
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
  onStatusChange,
}: {
  webhookUrl: string;
  snippet: string;
  /** Status when the tab rendered; the tab chip itself lives in the parent. */
  initialStatus: WebhookStatus;
  onStatusChange: (status: WebhookStatus) => void;
}) {
  const [step, setStep] = useState(1);
  const [secretHash] = useState(() => generateSecretHash());
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Saves the hash shown in step 2. Called by Next, so there is no save button. */
  async function saveSecretHash(): Promise<boolean> {
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
        completedAt?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not save the secret hash. Please try again.");
        return false;
      }
      onStatusChange({
        configured: true,
        updatedAt: body.updatedAt ?? new Date().toISOString(),
        completedAt: body.completedAt ?? null,
      });
      return true;
    } catch {
      setError("Could not save the secret hash. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function leaveStepTwo() {
    if (await saveSecretHash()) setStep(3);
  }

  /** Done: records the finish, which is what flips the tab chip to "Set up". */
  async function done() {
    setFinishing(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/fiat-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "flutterwave", complete: true }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        configured?: boolean;
        updatedAt?: string | null;
        completedAt?: string | null;
        error?: string;
      };
      if (!res.ok || !body.configured) {
        setError(body.error ?? "Save your secret hash first, then press Done.");
        return;
      }
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
          backLabel="Update setup"
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
          <p className="mt-2 text-sm text-slate">
            In the same Flutterwave webhook settings, paste this into the{" "}
            <Strong>Secret hash</Strong> field and click Save there.
          </p>
          <CodeField value={secretHash} label="Copy secret hash" />
        </SetupStep>
      ) : null}

      {step === 3 ? (
        <SetupStep title="Paste the snippet on your thank-you page">
          <p className="mt-2 text-sm text-slate">
            This is the page Flutterwave sends customers to after they pay. Paste
            the snippet once:
          </p>
          <SuccessPageSnippet snippet={snippet} />
        </SetupStep>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <SetupActions
        onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
        onNext={step === 1 ? () => setStep(2) : step === 2 ? leaveStepTwo : done}
        nextLabel={step === TOTAL_STEPS ? "Done" : "Next"}
        nextBusy={step === 2 ? busy : finishing}
        nextBusyLabel={step === 2 ? "Saving..." : "Checking..."}
      />
    </div>
  );
}
