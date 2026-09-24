import { RewardProviders } from "@/components/RewardProviders";
import { CustomerWalletPanel } from "@/components/CustomerWalletPanel";

export const dynamic = "force-dynamic";

/**
 * /wallet — the customer's own view of what they hold.
 *
 * This is where a reward LIVES after delivery. The claim page is a one-time
 * hand-over: it delivers the stock and then the customer needs somewhere to go
 * to see it, keep holding it, or send it somewhere else. Without this page the
 * product ends the moment a reward lands, which is not a finished customer
 * experience.
 *
 * There is no customer account in the Equixity database. Identity is Privy, and
 * the email a customer signs in with is the account. That is deliberate: the
 * same email always resolves to the same embedded wallet, so a customer earning
 * from several merchants sees all of it in one place and a second reward never
 * creates a second wallet.
 */
export default function WalletPage() {
  return (
    <RewardProviders>
      <main className="mx-auto min-h-screen w-full max-w-2xl bg-gradient-to-b from-equixity-mist/60 via-white to-white px-4 py-10 sm:py-14">
        <header className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
            Equixity
          </p>
          <h1 className="mt-1 font-display text-3xl font-medium text-ink">
            Your rewards
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate">
            Everything you have earned, and where to send it.
          </p>
        </header>

        <CustomerWalletPanel />
      </main>
    </RewardProviders>
  );
}
