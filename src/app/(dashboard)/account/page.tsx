import { requireDashboardMerchant } from "@/lib/auth/require-dashboard";
import { getDepositAddress } from "@/lib/services/merchant";
import { createClient } from "@/lib/supabase/server";
import { CopyButton } from "@/components/CopyButton";

export default async function AccountPage() {
  const { merchant } = await requireDashboardMerchant();
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data?.user?.email ?? "—";
  const depositAddress = await getDepositAddress(merchant.id);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Account</h1>
      <p className="mt-1 text-sm text-gray-500">
        Your account details and merchant identifier.
      </p>

      <div className="mt-6 max-w-xl rounded-lg border border-gray-200 bg-white p-5">
        <dl className="space-y-4 text-sm">
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
      </div>

      <div className="mt-6">
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Sign out
          </button>
        </form>
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