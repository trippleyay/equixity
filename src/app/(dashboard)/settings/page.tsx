import { requireDashboardMerchant } from "@/lib/auth/require-dashboard";
import { getDepositAddress, getSdkSnippet } from "@/lib/services/merchant";
import { getApiKeyStatus } from "@/lib/services/api-keys";
import { getWebhookSecretStatus } from "@/lib/services/merchant-webhook-secrets";
import { createClient } from "@/lib/supabase/server";
import { CopyButton } from "@/components/CopyButton";
import { ApiKeyPanel } from "@/components/ApiKeyPanel";
import { FiatWebhookPanel } from "@/components/FiatWebhookPanel";
import { FlutterwaveSetupPanel } from "@/components/FlutterwaveSetupPanel";
import { buildRewardPageUrl } from "@/lib/sdk/snippet";
import { env } from "@/lib/env";

/**
 * Settings = Account + Configuration (sidebar: "Settings").
 *
 * - Account: identity, merchant ID, deposit address, sign out.
 * - Configuration: each hosted payment webhook (Stripe, Flutterwave), the
 *   general API key for merchants with their own backend, and the ONE
 *   success-page snippet every path shares. There is no crypto section:
 *   Solana payments are dormant, and no snippet or setup is offered for them.
 */
export default async function SettingsPage() {
  const { merchant } = await requireDashboardMerchant();
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data?.user?.email ?? "—";
  const depositAddress = await getDepositAddress(merchant.id);
  const apiKey = await getApiKeyStatus(merchant.id);
  const snippet = getSdkSnippet(merchant.public_id);
  const stripeSecret = await getWebhookSecretStatus(merchant.id, "stripe");
  const flutterwaveSecret = await getWebhookSecretStatus(merchant.id, "flutterwave");
  const appBase = (env.nextPublicAppUrl || "https://equixity.vercel.app").replace(/\/+$/, "");
  const webhookUrl = `${appBase}/api/public/webhooks/stripe/${merchant.public_id}`;
  const flutterwaveWebhookUrl = `${appBase}/api/public/webhooks/flutterwave/${merchant.public_id}`;
  const rewardPagePattern = buildRewardPageUrl("<rewardEventId>");

  return (
    <div>
      <h1 className="font-display text-3xl font-medium text-ink">Settings</h1>
      <p className="mt-1 text-sm text-gray-500">
        Account details and payment configuration.
      </p>

      {/* --- Account ------------------------------------------------------ */}
      <section className="mt-6 rounded-2xl border border-ink/5 bg-white p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-ink">Account</h2>
        <div className="mt-4 grid gap-6 text-sm sm:grid-cols-2">
          <dl className="space-y-4">
            <Row label="Business name" value={merchant.name} />
            <Row label="Email" value={email} />
          </dl>
          <dl className="space-y-4">
            <Row label="Merchant ID" value={merchant.public_id} mono />
            <div>
              <dt className="text-xs font-medium text-gray-500">Deposit address</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all rounded-xl bg-equixity-mist/70 px-3 py-1.5 text-xs">
                  {depositAddress}
                </code>
                <CopyButton value={depositAddress} label="Copy address" />
              </dd>
            </div>
          </dl>
        </div>
        <form action="/auth/signout" method="post" className="mt-5">
          <button
            type="submit"
            className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
          >
            Sign out
          </button>
        </form>
      </section>

      {/* --- Configuration ------------------------------------------------- */}
      <h2 className="mt-8 text-lg font-semibold text-gray-900">Configuration</h2>
      <p className="mt-1 text-sm text-gray-500">
        Set up how your checkout connects with Equixity for rewards
        distribution.
      </p>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <FiatWebhookPanel
            webhookUrl={webhookUrl}
            initialConfigured={stripeSecret.configured}
            initialUpdatedAt={stripeSecret.updatedAt}
          />
        </div>

        <div className="min-w-0">
          <FlutterwaveSetupPanel
            webhookUrl={flutterwaveWebhookUrl}
            initialConfigured={flutterwaveSecret.configured}
            initialUpdatedAt={flutterwaveSecret.updatedAt}
          />
        </div>

        <div className="min-w-0">
          <ApiKeyPanel
            initialHasKey={apiKey.has_key}
            initialLastFour={apiKey.last_four}
            initialCreatedAt={apiKey.created_at}
            baseUrl={appBase}
          />
        </div>

        {/* The one snippet, shown once: every payment path uses this exact tag,
            and each processor panel explains where its own reference comes
            from. Full width so it reads as shared, not as a fourth processor. */}
        <div className="min-w-0 rounded-2xl border border-ink/5 bg-white p-5 shadow-soft lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink">Your success page</h2>
          <p className="mt-1 text-xs text-gray-500">
            One snippet for every payment method. Paste it once, at the bottom
            of the page the customer lands on after paying. Nothing in it needs
            filling in: the page address tells Equixity which order it was.
          </p>
          <pre className="mt-3 min-w-0 overflow-x-auto rounded-xl bg-equixity-mist/70 p-3 text-xs leading-5">
            <code>{snippet}</code>
          </pre>
          <div className="mt-2">
            <CopyButton value={snippet} label="Copy snippet" />
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Where the reference comes from: with Stripe, the redirect address
            includes <code className="text-[11px]">?session_id=&#123;CHECKOUT_SESSION_ID&#125;</code>{" "}
            and Stripe fills the value in itself. With Flutterwave, the
            reference is added automatically on redirect. With your own
            backend, send the customer to the page with{" "}
            <code className="text-[11px]">?order_id=</code> and the id you
            reported. Skipping the snippet entirely? The complete-card
            response already includes a{" "}
            <code className="text-[11px]">rewardEventId</code>, so you can send
            the customer straight to{" "}
            <code className="text-[11px]">{rewardPagePattern}</code>, where the
            whole claim happens.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd
        className={`mt-1 ${
          mono ? "break-all font-mono text-xs" : ""
        } text-gray-900`}
      >
        {value}
      </dd>
    </div>
  );
}
