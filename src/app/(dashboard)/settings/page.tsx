import { requireDashboardMerchant } from "@/lib/auth/require-dashboard";
import {
  getDepositAddress,
  getSdkSnippet,
  getSettings,
} from "@/lib/services/merchant";
import { getApiKeyStatus } from "@/lib/services/api-keys";
import { createClient } from "@/lib/supabase/server";
import { CopyButton } from "@/components/CopyButton";
import { ApiKeyPanel } from "@/components/ApiKeyPanel";
import { ReceivingWalletForm } from "@/components/ReceivingWalletForm";
import { env } from "@/lib/env";

/**
 * Settings = Account + Configuration (sidebar: "Settings").
 *
 * - Account: identity, merchant ID, deposit address, sign out.
 * - Configuration: everything the merchant's integrations need — fiat API key
 *   (table with delete), the Solana checkout snippet, and the receiving
 *   wallet that purchase verification checks against.
 */
export default async function SettingsPage() {
  const { merchant } = await requireDashboardMerchant();
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data?.user?.email ?? "—";
  const depositAddress = await getDepositAddress(merchant.id);
  const apiKey = await getApiKeyStatus(merchant.id);
  const settings = await getSettings(merchant.id);
  const snippet = getSdkSnippet(merchant.public_id);
  const appBase = (env.nextPublicAppUrl || "https://equixity.vercel.app").replace(/\/+$/, "");

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
      <ApiKeyPanel
        initialHasKey={apiKey.has_key}
        initialLastFour={apiKey.last_four}
        initialCreatedAt={apiKey.created_at}
        baseUrl={appBase}
      />

      <div className="rounded-2xl border border-ink/5 bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-ink">Crypto checkout (Solana)</h2>
          {!settings.receiving_wallet_address && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              ⚠ Receiving wallet not set
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Paste this into your checkout. It carries only your merchant ID.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-equixity-mist/70 p-3 text-xs leading-5">
          <code>{snippet}</code>
        </pre>
        <div className="mt-2">
          <CopyButton value={snippet} label="Copy snippet" />
        </div>

        <div className="mt-5 border-t border-ink/5 pt-4">
          <ReceivingWalletForm
            initialWallet={settings.receiving_wallet_address}
            currentAsset={settings.reward_asset}
            currentBps={settings.reward_bps}
            currentEnabled={settings.is_enabled}
            currentEligibilityConfirmed={settings.confirmed_customer_eligibility}
          />
        </div>
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
