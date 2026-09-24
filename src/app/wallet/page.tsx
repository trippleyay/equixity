import Link from "next/link";
import { RewardProviders } from "@/components/RewardProviders";
import { CustomerWalletPanel } from "@/components/CustomerWalletPanel";
import Wordmark from "@/components/site/Wordmark";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Customer Rewards - Equixity",
  description: "The stock you have earned, and where to send it.",
};

/**
 * /wallet — the customer's own view of what they hold.
 *
 * This is where a reward LIVES after delivery. The claim page is a one-time
 * hand-over: it delivers the stock and then the customer needs somewhere to go
 * to see it, keep holding it, or send it somewhere else. Without this page the
 * product ends the moment a reward lands, which is not a finished customer
 * experience.
 *
 * The customer mostly sees this on a phone, so it is a single capped column with
 * full width cards and nothing that needs a wide screen. It carries the same
 * brand system as the merchant dashboard (mist wash, elevated white cards, the
 * purple gradient for the one number that matters) so the two sides of the
 * product read as one thing rather than two.
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
      <main className="min-h-screen bg-gradient-to-b from-equixity-mist/70 via-white to-white">
        <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:pt-12">
          <header className="mb-8 flex items-center justify-between gap-4">
            <Link href="/" aria-label="Equixity home">
              <Wordmark variant="dark" className="h-7 w-auto" />
            </Link>
            <Link
              href="/"
              className="text-xs font-medium text-slate transition-colors hover:text-equixity-deep"
            >
              Back to site
            </Link>
          </header>

          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-equixity-deep">
              Customer rewards
            </p>
            <h1 className="mt-2 font-display text-3xl font-medium leading-tight text-ink sm:text-4xl">
              Your rewards
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate">
              Everything you have earned, and where to send it.
            </p>
          </div>

          <CustomerWalletPanel />
        </div>
      </main>
    </RewardProviders>
  );
}
