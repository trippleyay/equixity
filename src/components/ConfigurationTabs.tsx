"use client";

import { useState } from "react";
import { ApiKeyPanel, type KeyState } from "@/components/ApiKeyPanel";
import { FlutterwaveSetupPanel } from "@/components/FlutterwaveSetupPanel";
import { StripeSetupPanel } from "@/components/StripeSetupPanel";
import type { WebhookStatus } from "@/components/SetupGuide";

/**
 * Configuration on Settings: three tabs, one per way to earn rewards, with only
 * the selected path on screen. Inside a tab the path is walked one step at a
 * time and ends with the one success-page snippet that path needs, so the page
 * reads as setup rather than as documentation.
 *
 * All three panels stay mounted and inactive ones are hidden, so a merchant who
 * switches tabs mid-setup keeps the step they were on and the exact secret hash
 * that was shown to them.
 *
 * A path only reads as "Set up" once the merchant pressed Done (completedAt).
 * A stored secret alone shows "Finish setup": saving the secret in step 2 is not
 * the same as having walked the steps and pasted the snippet.
 */

type TabId = "stripe" | "flutterwave" | "api";
type Tone = "done" | "todo" | "info";

const TABS: { id: TabId; label: string }[] = [
  { id: "stripe", label: "Stripe" },
  { id: "flutterwave", label: "Flutterwave" },
  { id: "api", label: "Checkout API" },
];

const TITLES: Record<TabId, string> = {
  stripe: "Stripe card payments",
  flutterwave: "Flutterwave card payments",
  api: "Checkout API",
};

const BLURBS: Record<TabId, string> = {
  stripe: "Card payments through Stripe create rewards.",
  flutterwave: "Card, bank and mobile money payments through Flutterwave create rewards.",
  api: "For a custom checkout or a processor we do not support yet. Your backend reports each completed order with this key.",
};

const TONE_CLASSES: Record<Tone, string> = {
  done: "bg-emerald-100 text-emerald-800",
  todo: "bg-amber-100 text-amber-800",
  info: "bg-equixity-mist text-equixity-deep",
};

/** Dates are only shown when they parse; callers supply their own fallback. */
function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString();
}

/** Green pill only after Done; purple "Finish setup" while a secret sits unsaved. */
function pathStatus(
  configured: boolean,
  completedAt: string | null,
): { label: string; tone: Tone } {
  if (!configured) return { label: "Not set up yet", tone: "todo" };
  const finished = shortDate(completedAt);
  return finished
    ? { label: `Set up ${finished}`, tone: "done" }
    : { label: "Finish setup", tone: "info" };
}

export function ConfigurationTabs({
  stripe,
  flutterwave,
  apiKey,
  snippet,
  baseUrl,
  rewardPagePattern,
}: {
  stripe: { webhookUrl: string } & WebhookStatus;
  flutterwave: { webhookUrl: string } & WebhookStatus;
  apiKey: KeyState;
  snippet: string;
  baseUrl: string;
  rewardPagePattern: string;
}) {
  const [tab, setTab] = useState<TabId>("stripe");
  const [stripeStatus, setStripeStatus] = useState<WebhookStatus>({
    configured: stripe.configured,
    updatedAt: stripe.updatedAt,
    completedAt: stripe.completedAt,
  });
  const [flutterwaveStatus, setFlutterwaveStatus] = useState<WebhookStatus>({
    configured: flutterwave.configured,
    updatedAt: flutterwave.updatedAt,
    completedAt: flutterwave.completedAt,
  });
  const [apiKeyStatus, setApiKeyStatus] = useState<KeyState>(apiKey);

  const apiKeyDate = shortDate(apiKeyStatus.createdAt);
  const activeIndex = TABS.findIndex((t) => t.id === tab);

  const status: Record<TabId, { label: string; tone: Tone }> = {
    stripe: pathStatus(stripeStatus.configured, stripeStatus.completedAt),
    flutterwave: pathStatus(
      flutterwaveStatus.configured,
      flutterwaveStatus.completedAt,
    ),
    api: apiKeyStatus.hasKey
      ? {
          label: apiKeyDate ? `Key created ${apiKeyDate}` : "Key active",
          tone: "done",
        }
      : { label: "No key yet", tone: "info" },
  };

  return (
    <div>
      <div className="mt-6 rounded-2xl border border-ink/5 bg-white p-1 shadow-soft sm:rounded-full">
        <div className="relative grid grid-cols-3">
          {/* The purple pill slides across when you switch tabs rather than
              blinking out of one and into the next. The panel below still
              swaps instantly. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 rounded-2xl bg-equixity transition-transform duration-300 ease-out sm:rounded-full"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          />
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={active}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`relative z-10 flex min-w-0 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition-colors duration-300 sm:rounded-full ${
                  active ? "text-white" : "text-slate hover:text-ink"
                }`}
              >
                <span className="truncate">{t.label}</span>
                {status[t.id].tone === "done" ? (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {TABS.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={t.id !== tab}
          className="mt-4 rounded-2xl border border-ink/5 bg-white p-5 shadow-soft"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-ink">{TITLES[t.id]}</h3>
              <p className="mt-1 text-xs leading-5 text-slate">{BLURBS[t.id]}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${TONE_CLASSES[status[t.id].tone]}`}
            >
              {status[t.id].label}
            </span>
          </div>

          <div className="mt-4 border-t border-ink/5 pt-4">
            {t.id === "stripe" ? (
              <StripeSetupPanel
                webhookUrl={stripe.webhookUrl}
                snippet={snippet}
                initialStatus={stripeStatus}
                onStatusChange={setStripeStatus}
              />
            ) : null}
            {t.id === "flutterwave" ? (
              <FlutterwaveSetupPanel
                webhookUrl={flutterwave.webhookUrl}
                snippet={snippet}
                initialStatus={flutterwaveStatus}
                onStatusChange={setFlutterwaveStatus}
              />
            ) : null}
            {t.id === "api" ? (
              <ApiKeyPanel
                initialHasKey={apiKeyStatus.hasKey}
                initialLastFour={apiKeyStatus.lastFour}
                initialCreatedAt={apiKeyStatus.createdAt}
                baseUrl={baseUrl}
                snippet={snippet}
                rewardPagePattern={rewardPagePattern}
                onStatusChange={setApiKeyStatus}
              />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
