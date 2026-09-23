import { requireDashboardMerchant } from "@/lib/auth/require-dashboard";
import { getDepositAddress, getSdkSnippet } from "@/lib/services/merchant";
import { getApiKeyStatus } from "@/lib/services/api-keys";
import { getWebhookSecretStatus } from "@/lib/services/merchant-webhook-secrets";
import { createClient } from "@/lib/supabase/server";
import { CopyButton } from "@/components/CopyButton";
import { ConfigurationTabs } from "@/components/ConfigurationTabs";
import { buildRewardPageUrl } from "@/lib/sdk/snippet";
import { env } from "@/lib/env";

/**
 * Settings = Account + Configuration (sidebar: "Settings").
 *
 * - Account: identity, merchant ID, deposit address, sign out.
 * - Configuration: three tabs, one per way in (Stripe, Flutterwave, and the
 *   Checkout API for a merchant's own backend), with only the selected path on
 *   screen. Each path is walked one step at a time instead of every instruction
 *   being printed at once, and the ONE success-page snippet every path shares is
 *   that path's last step. There is no crypto section: Solana payments are
 *   dormant, and no snippet or setup is offered for them.
 */
export default async function SettingsPage() {
  const { merchant } = await requireDashboardMerchant();
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data?.user?.email ?? "Not set";
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

      <ConfigurationTabs
        stripe={{
          webhookUrl,
          configured: stripeSecret.configured,
          updatedAt: stripeSecret.updatedAt,
          completedAt: stripeSecret.completedAt,
        }}
        flutterwave={{
          webhookUrl: flutterwaveWebhookUrl,
          configured: flutterwaveSecret.configured,
          updatedAt: flutterwaveSecret.updatedAt,
          completedAt: flutterwaveSecret.completedAt,
        }}
        apiKey={{
          hasKey: apiKey.has_key,
          lastFour: apiKey.last_four,
          createdAt: apiKey.created_at,
        }}
        snippet={snippet}
        baseUrl={appBase}
        rewardPagePattern={rewardPagePattern}
      />
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
