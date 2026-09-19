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
      <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
      <p className="mt-1 text-sm text-gray-500">
        Account details and payment configuration.
      </p>

      {/* --- Account ------------------------------------------------------ */}
      <section className="mt-6 max-w-xl rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-700">Account</h2>
        <dl className="mt-4 space-y-4 text-sm">
          <Row label="Business name" value={merchant.name} />
          <Row label="Email" value={email} />
          <Row label="Merchant ID" value={merchant.public_id} mono />
          <div>
            <dt className="text-xs font-medium text-gray-500">Deposit address</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-gray-100 px-3 py-1.5 text-xs">
                {depositAddress}
              </code>
              <CopyButton value={depositAddress} label="Copy address" />
            </dd>
          </div>
        </dl>
        <form action="/auth/signout" method="post" className="mt-5">
          <button
            type="submit"
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Sign out
          </button>
        </form>
      </section>

      {/* --- Configuration ------------------------------------------------- */}
      <h2 className="mt-8 text-lg font-semibold text-gray-900">Configuration</h2>
      <p className="mt-1 text-sm text-gray-500">
        How your checkout talks to Equixity — fiat card payments and Solana
        crypto payments.
      </p>

      <ApiKeyPanel
        initialHasKey={apiKey.has_key}
        initialLastFour={apiKey.last_four}
        initialCreatedAt={apiKey.created_at}
        baseUrl={appBase}
      />

      <div className="mt-6 max-w-xl rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-700">Crypto checkout (Solana)</h2>
        <p className="mt-1 text-xs text-gray-500">
          Paste this into your checkout. It carries only your merchant ID.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-gray-100 p-3 text-xs leading-5">
          <code>{snippet}</code>
        </pre>
        <div className="mt-2">
          <CopyButton value={snippet} label="Copy snippet" />
        </div>
      </div>

      <ReceivingWalletForm
        initialWallet={settings.receiving_wallet_address}
        currentAsset={settings.reward_asset}
        currentBps={settings.reward_bps}
        currentEnabled={settings.is_enabled}
        currentEligibilityConfirmed={settings.confirmed_customer_eligibility}
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
