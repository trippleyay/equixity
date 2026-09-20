import { requireDashboardMerchant } from "@/lib/auth/require-dashboard";
import { getDepositAddress } from "@/lib/services/merchant";
import {
  listFundingTransactions,
  syncFunding,
  type FundingTransactionRow,
} from "@/lib/solana/sync-deposits";
import { reconcileWithdrawals } from "@/lib/solana/withdraw";
import { reconcileClaims } from "@/lib/services/claim-reconcile";
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

  // Reward claims: same poll-on-view reconciliation as withdrawals (spec
  // section 6 step 8). A claim stuck in 'claiming' is resolved against the
  // chain here — never assumed, and never refunded while it might still land.
  if (hasAlchemyRpcConfigured()) {
    try {
      await reconcileClaims();
    } catch {
      // Best-effort: a reconciliation failure must not break the Funding view.
    }
  }

  // Merged activity feed: deposits + withdrawals, newest first. The signature
  // is the ONLY chain identifier, so it is always the full value with a copy
  // affordance rather than display-only truncation.
  const history: Array<{
    key: string;
    type: string;
    amount: string;
    status: string;
    ts: number;
    date: string;
    signature: string | null;
  }> = [
    ...transactions.map((t) => ({
      key: `d-${t.id}`,
      type: "Deposit",
      amount: `$${formatUsdcUnits(t.amount_usdc_units)}`,
      status: t.status,
      ts: new Date(t.detected_at).getTime(),
      date: new Date(t.detected_at).toLocaleString(),
      signature: t.transaction_signature,
    })),
    ...withdrawals.map((w) => ({
      key: `w-${w.id}`,
      type: "Withdrawal",
      amount: `$${formatUsdcUnits(w.amount_usdc_units)}`,
      status: withdrawStatusLabel(w.status),
      ts: new Date(w.created_at).getTime(),
      date: new Date(w.created_at).toLocaleString(),
      signature: w.transaction_signature,
    })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div>
      <h1 className="font-display text-3xl font-medium text-ink">Funding</h1>
      <p className="mt-1 text-sm text-slate">
        Send USDC to your personal deposit address from any wallet, any time.
      </p>

      {notice && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {notice}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-ink/5 bg-white p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-ink">Deposit address</h2>
        <div className="mt-2 flex items-center gap-2">
          <code className="break-all rounded-xl bg-equixity-mist/70 px-3 py-2 text-xs">
            {depositAddress}
          </code>
          <CopyButton value={depositAddress} label="Copy address" />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Please only deposit USDC via the Solana network to this address;
          these deposits are credited immediately.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-ink/5 bg-white p-5 shadow-soft">
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
        <section className="mt-6 rounded-2xl border border-ink/5 bg-white p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-ink">Withdraw USDC</h2>
          <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {withdrawNotice}
          </p>
        </section>
      ) : (
        <WithdrawForm />
      )}

      <section className="mt-6 overflow-x-auto rounded-2xl border border-ink/5 bg-white shadow-soft">
        <div className="border-b border-ink/5 px-5 py-4 text-sm font-semibold text-ink">
          History
        </div>
        {history.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">
            No activity yet. Deposits and withdrawals appear here once they
            happen.
          </p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-ink/5">
              <tr>
                <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate">Type</th>
                <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate">Amount</th>
                <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate">Status</th>
                <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate">Date</th>
                <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate">Tx Signature</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.key} className="border-b border-ink/5 transition last:border-0 hover:bg-equixity-mist/40">
                  <td className="px-5 py-3 font-medium text-ink">{row.type}</td>
                  <td className="px-5 py-3">{row.amount}</td>
                  <td className="px-5 py-3 capitalize text-slate">{row.status}</td>
                  <td className="px-5 py-3 text-slate">{row.date}</td>
                  <td className="px-5 py-3">
                    {row.signature ? (
                      <span className="flex items-center gap-2">
                        <code className="font-mono text-xs text-slate">
                          {row.signature.slice(0, 16)}...{row.signature.slice(-6)}
                        </code>
                        <CopyButton value={row.signature} label="Copy" />
                      </span>
                    ) : (
                      <span className="text-slate">-</span>
                    )}
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