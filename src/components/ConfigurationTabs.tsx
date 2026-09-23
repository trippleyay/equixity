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
  stripe: "Card payments through Stripe create rewards, with nothing to build.",
  flutterwave: "Card, bank and mobile money payments through Flutterwave create rewards.",
  api: "For your own checkout or a processor we do not host a webhook for. Your backend reports each completed order with this key.",
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
  });
  const [flutterwaveStatus, setFlutterwaveStatus] = useState<WebhookStatus>({
    configured: flutterwave.configured,
    updatedAt: flutterwave.updatedAt,
  });
  const [apiKeyStatus, setApiKeyStatus] = useState<KeyState>(apiKey);

  const stripeDate = shortDate(stripeStatus.updatedAt);
  const flutterwaveDate = shortDate(flutterwaveStatus.updatedAt);
  const apiKeyDate = shortDate(apiKeyStatus.createdAt);

  const status: Record<TabId, { label: string; tone: Tone }> = {
    stripe: stripeStatus.configured
      ? { label: stripeDate ? `Set up ${stripeDate}` : "Set up", tone: "done" }
      : { label: "Not set up yet", tone: "todo" },
    flutterwave: flutterwaveStatus.configured
      ? {
          label: flutterwaveDate ? `Set up ${flutterwaveDate}` : "Set up",
          tone: "done",
        }
      : { label: "Not set up yet", tone: "todo" },
    api: apiKeyStatus.hasKey
      ? {
          label: apiKeyDate ? `Key created ${apiKeyDate}` : "Key active",
          tone: "done",
        }
      : { label: "No key yet", tone: "info" },
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Payment setup"
        className="mt-6 flex flex-wrap gap-1 rounded-2xl border border-ink/5 bg-white p-1 shadow-soft sm:rounded-full"
      >
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
              className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition sm:rounded-full ${
                active
                  ? "bg-equixity text-white"
                  : "text-slate hover:bg-equixity-mist hover:text-ink"
              }`}
            >
              <span className="truncate">{t.label}</span>
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  status[t.id].tone === "done" ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
            </button>
          );
        })}
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
