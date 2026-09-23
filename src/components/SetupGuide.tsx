"use client";

import type { ReactNode } from "react";

/**
 * Shared pieces of the Configuration setup guides (Settings → Configuration).
 *
 * Each tab shows one payment path, and each path is walked one step at a time:
 * a progress bar, the step being worked on, and a Back/Next footer. Showing one
 * step at a time is what keeps the screen reading as setup instead of as
 * developer documentation.
 */

/**
 * Secret-presence status for a hosted webhook; never the secret itself.
 * `completedAt` is only set once the merchant pressed Done, which is what the
 * Configuration tabs read as "Set up".
 */
export type WebhookStatus = {
  configured: boolean;
  updatedAt: string | null;
  completedAt: string | null;
};

/** Progress bar plus "Step N of M" for a path that has a fixed sequence. */
export function SetupProgress({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition ${
              i < step ? "bg-equixity" : "bg-equixity-mist"
            }`}
          />
        ))}
      </div>
      <span className="shrink-0 text-[11px] font-medium text-slate">
        Step {step} of {total}
      </span>
    </div>
  );
}

/** One step's heading plus body. */
export function SetupStep({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-ink">{title}</h4>
      {children}
    </div>
  );
}

/**
 * Back/Next/Done footer. `onNext` is omitted on a step with nothing after it,
 * and `nextLabel="Done"` marks the explicit finish action (which the panels use
 * to re-check the stored secret and close the guide out).
 */
export function SetupActions({
  onBack,
  backLabel = "← Back",
  onNext,
  nextLabel = "Next",
  nextDisabled = false,
  nextBusy = false,
  nextBusyLabel = "Checking...",
}: {
  onBack?: () => void;
  backLabel?: string;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextBusy?: boolean;
  nextBusyLabel?: string;
}) {
  return (
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-ink/5 pt-4">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-slate transition hover:text-ink"
        >
          {backLabel}
        </button>
      ) : (
        <span />
      )}
      {onNext ? (
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || nextBusy}
          className="rounded-full bg-equixity px-5 py-2 text-sm font-medium text-white transition hover:bg-equixity-deepDark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {nextBusy ? nextBusyLabel : nextLabel}
        </button>
      ) : null}
    </div>
  );
}
