import { requireDashboardMerchant } from "@/lib/auth/require-dashboard";
import { getDepositAddress } from "@/lib/services/merchant";
import {
  listFundingTransactions,
  syncFunding,
  type FundingTransactionRow,
} from "@/lib/solana/sync-deposits";
import { reconcileWithdrawals } from "@/lib/solana/withdraw";
import { hasAlchemyRpcConfigured } from "@/lib/solana/connection";
import { hasFeePayerConfigured } from "@/lib/solana/fee-payer";
import { getBalance } from "@/lib/services/merchant";
import {
  listWithdrawals,
  type WithdrawalRow,
} from "@/lib/services/withdrawals";
import { formatUsdcUnits } from "@/lib/format";
import { CopyButton } from "@/components/CopyButton";
import { CheckDepositsButton } from "@/components/CheckDepositsButton";
import { WithdrawForm } from "@/components/WithdrawForm";

export default async function FundingPage() {
  const { merchant } = await requireDashboardMerchant();

  const depositAddress = await getDepositAddress(merchant.id);

  // Poll-on-view: a page load IS a deposit check (spec sections 1 & 5).
  let balance: string;
  let transactions: FundingTransactionRow[];
  let notice: string | null = null;
  if (hasAlchemyRpcConfigured()) {
    const result = await syncFunding(merchant.id);
    balance = result.balance;
    transactions = result.transactions;
  } else {
    const stored = await listFundingTransactions(merchant.id);
    balance = stored.balance;
    transactions = stored.transactions;
    notice =
      "Funding sync is not configured (ALCHEMY_SOLANA_RPC_URL is unset), so this " +
      "page is showing stored data only. Set that env var to enable on-chain " +
      "deposit detection.";
  }

  // Withdrawals: reconcile any stale in-flight rows on page view, then list.
  let withdrawals: WithdrawalRow[] = [];
  let withdrawNotice: string | null = null;
  if (hasAlchemyRpcConfigured() && hasFeePayerConfigured()) {
    await reconcileWithdrawals(merchant.id);
  } else if (!hasFeePayerConfigured()) {
    withdrawNotice =
      "Withdrawals are disabled — FEE_PAYER_SECRET_KEY is unset in the server " +
      "environment.";
  }
  withdrawals = await listWithdrawals(merchant.id);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Funding</h1>
      <p className="mt-1 text-sm text-gray-500">
        Send USDC to your personal deposit address from any wallet, any time.
      </p>

      {notice && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {notice}
        </div>
      )}

      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-700">Deposit address</h2>
        <div className="mt-2 flex items-center gap-2">
          <code className="break-all rounded bg-gray-100 px-3 py-2 text-xs">
            {depositAddress}
          </code>
          <CopyButton value={depositAddress} label="Copy address" />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          This address is yours alone — any confirmed USDC sent to it is
          credited to your balance automatically.
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Available balance
            </div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">
              ${formatUsdcUnits(balance)}
            </div>
          </div>
          <CheckDepositsButton disabled={!hasAlchemyRpcConfigured()} />
        </div>
      </section>

      {withdrawNotice ? (
        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-700">Withdraw USDC</h2>
          <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {withdrawNotice}
          </p>
        </section>
      ) : (
        <WithdrawForm />
      )}

      <section className="mt-6 rounded-lg border border-gray-200 bg-white">
        <div className="px-4 py-3 text-sm font-semibold text-gray-700">
          Deposit history
        </div>
        {transactions.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-500">
            No deposits yet. Once you send USDC to your address, confirmed
            transfers appear here.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-4 py-2">Signature</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Detected</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs text-gray-600">
                    {t.transaction_signature.slice(0, 24)}…
                  </td>
                  <td className="px-4 py-2">${formatUsdcUnits(t.amount_usdc_units)}</td>
                  <td className="px-4 py-2 capitalize text-gray-600">{t.status}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {new Date(t.detected_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white">
        <div className="px-4 py-3 text-sm font-semibold text-gray-700">
          Withdrawal history
        </div>
        {withdrawals.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-500">
            No withdrawals yet. Use the form above to pull your balance out.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Destination</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Signature</th>
                <th className="px-4 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id} className="border-b border-gray-100">
                  <td className="px-4 py-2">${formatUsdcUnits(w.amount_usdc_units)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-600">
                    {w.destination_address.slice(0, 16)}…{w.destination_address.slice(-6)}
                  </td>
                  <td className="px-4 py-2 capitalize text-gray-600">
                    {withdrawStatusLabel(w.status)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">
                    {w.transaction_signature
                      ? `${w.transaction_signature.slice(0, 18)}…`
                      : w.failure_reason ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {new Date(w.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function withdrawStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "pending";
    case "submitted":
      return "submitting";
    case "confirmed":
      return "confirmed";
    case "failed":
      return "failed";
    default:
      return status;
  }
}