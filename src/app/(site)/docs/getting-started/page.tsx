import type { Metadata } from "next";
import DocsArticle from "@/components/docs/DocsArticle";
import {
  A,
  H2,
  H3,
  LI,
  Note,
  P,
  Strong,
  Table,
  UL,
} from "@/components/docs/Prose";

export const metadata: Metadata = {
  title: "Getting started - Equixity Docs",
  description:
    "Create an Equixity account, fund your reward balance, and start issuing stock rewards at checkout.",
};

export default function GettingStartedPage() {
  return (
    <DocsArticle
      title="Getting started"
      lede="Seven steps from an empty account to rewards landing in a customer's hands. About fifteen minutes, most of it waiting on a deposit to confirm."
    >
      <H2>What you need</H2>
      <UL>
        <LI>An email address. That is the whole signup.</LI>
        <LI>
          A Stripe or Flutterwave account, or a checkout of your own. Equixity
          works with the payment setup you already have, so there is no new
          payment provider to adopt.
        </LI>
        <LI>
          USDC on Solana to fund rewards. This is what buys the stock, and you
          can withdraw whatever you do not spend.
        </LI>
      </UL>
      <Note title="Nothing crypto is required to accept card payments">
        <p>
          If you take cards, you never need to touch a wallet, hold SOL, or
          understand the delivery mechanics. Equixity handles all of it,
          including creating a wallet for your customer.
        </p>
      </Note>

      <H2>The setup</H2>

      <H3>1. Create your account</H3>
      <P>
        Sign up at <A href="/login">the merchant sign in page</A> with your email
        and a password. Your merchant record is created automatically the moment
        you sign up, along with your settings, a zero balance, and a personal
        deposit address. There is no separate onboarding form.
      </P>

      <H3>2. Fund your reward balance</H3>
      <P>
        Open <Strong>Funding</Strong> and copy your deposit address. Send USDC to
        it over the Solana network, then press{" "}
        <Strong>Check for new deposits</Strong>. Confirmed transfers are credited
        to your available balance.
      </P>
      <P>
        This balance is what pays for rewards. When a reward is issued its value
        is reserved from the balance, so an unfunded account cannot distribute
        anything. You can withdraw any part of the balance back to a wallet you
        control from the same page, at any time.
      </P>
      <Note title="Send USDC on Solana only">
        <p>
          Other networks and other tokens are not detected. If you send the wrong
          asset to a deposit address, it cannot be recovered through Equixity.
        </p>
      </Note>

      <H3>3. Confirm eligibility</H3>
      <P>
        Open <Strong>Rewards</Strong> and tick the eligibility statement. This is
        a compliance requirement rather than a formality: rewards cannot be
        switched on without it, and it is enforced on the server, not only in
        your browser.
      </P>
      <P>
        In short, Equixity is not available to businesses serving customers based
        in, or residents of, the United States (including U.S. Persons), the
        United Kingdom, Canada, Australia, Mainland China, or any OFAC sanctioned
        jurisdiction. Customers visiting the reward page from those locations are
        blocked from receiving a reward.
      </P>

      <H3>4. Choose the stock and the rate</H3>
      <P>
        Still on <Strong>Rewards</Strong>, pick the stock you want to give and the
        percentage of each sale it corresponds to. Anything from 0.01% to 20%.
        See <A href="/docs/configuring-rewards">Configuring rewards</A> for how
        the maths works.
      </P>

      <H3>5. Turn rewards on</H3>
      <P>
        Flip the switch. From this point every completed purchase creates a
        reward. Turning it back off does not delete purchase history: those
        purchases are simply recorded without a reward attached.
      </P>

      <H3>6. Connect your checkout</H3>
      <P>
        Open <Strong>Settings</Strong>, then <Strong>Configuration</Strong>, and
        choose how your checkout will tell Equixity about completed orders.
      </P>
      <Table
        head={["Option", "For", "Setup"]}
        rows={[
          [
            "Stripe",
            "Stores using Stripe Checkout",
            "Paste one web address into Stripe, and one signing secret back. No code.",
          ],
          [
            "Flutterwave",
            "Stores using Flutterwave",
            "Paste one web address and one secret hash. No code.",
          ],
          [
            "Checkout API",
            "Custom checkouts, or a provider not listed here",
            "Generate an API key and report each completed order from your own backend.",
          ],
        ]}
      />
      <P>
        Each option has a step by step guide in the dashboard. Full detail is in{" "}
        <A href="/docs/connecting-your-checkout">Connecting your checkout</A>.
      </P>

      <H3>7. Add the snippet to your success page</H3>
      <P>
        The last step of every guide is the same: one line of HTML on the page the
        customer lands on after paying. That is what shows them they have earned
        something. It goes in once and never needs editing per order. See{" "}
        <A href="/docs/success-page-snippet">The success page snippet</A>.
      </P>

      <H2>What happens when a customer buys</H2>
      <P>Once those seven steps are done, this is the flow, unattended:</P>
      <UL>
        <LI>
          The customer pays with a normal card on your normal checkout. Nothing
          about their experience changes.
        </LI>
        <LI>
          Your payment provider tells Equixity the order completed, or your own
          backend reports it if you are using the Checkout API.
        </LI>
        <LI>
          Equixity calculates the reward from the purchase amount and your rate,
          and reserves that value from your balance.
        </LI>
        <LI>
          A small notification appears on your success page saying they earned
          something.
        </LI>
        <LI>
          They tap it, confirm they are eligible, and say where the stock should
          go. If they have no wallet, one is created for them using just an email
          or a Google account.
        </LI>
        <LI>
          Equixity buys the stock and sends it to them. The order appears in your
          reward history in the dashboard.
        </LI>
      </UL>

      <H2>Where to look if something seems off</H2>
      <Table
        head={["What you see", "Where to look"]}
        rows={[
          [
            "No rewards are being created",
            "Rewards page. Check the switch is on and the eligibility statement is confirmed.",
          ],
          [
            "Rewards exist but the customer sees nothing",
            "The snippet is missing from the success page, or the page address has no order reference on it. The browser console names exactly what is missing.",
          ],
          [
            "The balance keeps dropping",
            "Every reward is reserved from your balance when its purchase is recorded. The reward history itemises them.",
          ],
          [
            "A reward shows as failed",
            "The value was returned to your balance automatically. The customer can try again from the same reward link.",
          ],
        ]}
      />

      <H2>Next</H2>
      <P>
        <A href="/docs/configuring-rewards">Configuring rewards</A> explains the
        maths, the statuses, and what your balance does.{" "}
        <A href="/docs/connecting-your-checkout">Connecting your checkout</A> has
        the per provider detail.
      </P>
    </DocsArticle>
  );
}
