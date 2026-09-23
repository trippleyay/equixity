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
  title: "Configuring rewards - Equixity Docs",
  description:
    "How Equixity calculates a reward, how your balance backs it, and every status a reward can be in.",
};

export default function ConfiguringRewardsPage() {
  return (
    <DocsArticle
      title="Configuring rewards"
      lede="Two settings decide what a customer earns: the stock, and the percentage of the sale. Everything else is automatic."
    >
      <H2>The two settings</H2>
      <H3>The stock</H3>
      <P>
        You choose from the assets Equixity supports, which include individual
        large cap stocks and index style tokens. Each asset carries a live unit
        price that refreshes on a schedule, and that price is what converts a
        reward from a dollar value into a quantity of stock.
      </P>
      <P>
        You can change the stock whenever you like. A change applies to
        purchases made after it, never to rewards already issued or already
        waiting to be claimed.
      </P>

      <H3>The rate</H3>
      <P>
        A percentage of each sale, expressed to two decimal places. The floor is
        0.01% and the ceiling is 20%. The default on a new account is 1%.
      </P>
      <P>
        Two properties are worth knowing because they decide how the number
        behaves in practice:
      </P>
      <UL>
        <LI>
          <Strong>The value is truncated, never rounded up.</Strong> A reward of
          $2.4999 is issued as $2.49. This is deliberate, so a reward can never
          exceed the value that backs it.
        </LI>
        <LI>
          <Strong>Small purchases can fall below one unit.</Strong> If a
          purchase is so small that its reward is worth less than one
          indivisible unit of the chosen stock, the reward cannot be priced and
          the purchase reports an error instead of recording a zero value.
        </LI>
      </UL>

      <H2>How a reward is calculated</H2>
      <P>In order, for every completed purchase:</P>
      <UL>
        <LI>
          The purchase amount is taken in US dollars. On a card path this is the
          amount your provider or your backend reports, never a number typed
          into a page.
        </LI>
        <LI>
          The rate is applied to produce the reward value in dollars.
        </LI>
        <LI>
          That value is reserved from your balance immediately, so the money is
          committed the moment the reward exists.
        </LI>
        <LI>
          When the customer claims, the reserved value is converted into the
          chosen stock at the live unit price of that moment, and the stock is
          sent to their wallet.
        </LI>
      </UL>
      <Note title="Rewards are measured in US dollars">
        <p>
          A charge in another currency is refused rather than converted, so a
          customer paying in a non USD currency receives no reward and no reward
          value is reserved. Supporting other currencies would be a currency
          conversion feature, not a setting.
        </p>
      </Note>
      <Note title="A reward is a percentage of a sale, not of your balance">
        <p>
          Your balance does not set the rate. It only has to be sufficient. If a
          purchase would reserve more than the balance holds, that reward cannot
          be issued, so keep the balance funded above the rewards you expect to
          hand out.
        </p>
      </Note>

      <H2>Reward statuses</H2>
      <P>
        Every purchase ends in exactly one of these, and none of them is a dead
        end. The status is visible on the reward record.
      </P>
      <Table
        head={["Status", "What it means", "What happens next"]}
        rows={[
          [
            "Rewards disabled",
            "The purchase was recorded while rewards were switched off. No reward value was reserved.",
            "Nothing. The record exists so your history is complete.",
          ],
          [
            "Pending",
            "A reward exists and its value is reserved from your balance. The customer has not claimed yet.",
            "Waits for the customer. Nothing else is needed from you.",
          ],
          [
            "Claiming",
            "The customer confirmed and delivery is in progress. It is a few seconds in the normal case.",
            "Completes on its own. If it stalls, it is checked and resolved automatically the next time you open the Funding page.",
          ],
          [
            "Delivered",
            "The stock was bought and sent to the customer's wallet.",
            "Done. The transaction link is stored against the reward.",
          ],
          [
            "Failed",
            "Delivery did not complete, for example the stock could not be bought at that moment.",
            "The reserved value is returned to your balance automatically and the customer can retry from the same reward link.",
          ],
          [
            "Ineligible",
            "The claim was blocked by the compliance gate, and it is recorded plainly rather than being treated as a technical failure.",
            "Terminal. No value leaves your balance for a blocked claim.",
          ],
        ]}
      />
      <Note title="Failed and ineligible are different things">
        <p>
          A failed reward is a technical problem that resolves by retrying, and
          your balance is credited back. An ineligible reward is a compliance
          decision that will not change if the customer retries. Keeping them
          distinct is what makes your history readable.
        </p>
      </Note>

      <H2>Your balance</H2>
      <P>
        The balance shown on the Funding page is available USDC: what remains
        after every reward that is pending, claiming, or delivered has taken its
        share. It is not affected by rewards that failed or were blocked, since
        those values return to it.
      </P>
      <P>
        You can withdraw any available amount to any Solana address, at any
        time, without asking Equixity. A withdrawal is executed immediately
        rather than queued. See{" "}
        <A href="/docs/getting-started">Getting started</A> for funding, and the
        Funding page itself for the current balance and full history.
      </P>

      <H2>Eligibility, and where it is enforced</H2>
      <P>
        The eligibility statement on the Rewards page is enforced in two
        independent places, which is why it is worth taking seriously:
      </P>
      <UL>
        <LI>
          <Strong>On your side.</Strong> Rewards cannot be enabled, and a
          settings change cannot switch them on, until the statement is
          confirmed. This is checked on the server rather than only in the
          browser, so it cannot be bypassed.
        </LI>
        <LI>
          <Strong>On the customer side.</Strong> When a customer opens a reward
          page, their country is checked before anything is delivered. A
          customer in a restricted jurisdiction is shown a clear message instead
          of a reward, and no value is taken from your balance.
        </LI>
      </UL>
      <Note title="A blocked customer costs you nothing">
        <p>
          A blocked claim never reserves or spends your balance, and it is
          recorded as its own status rather than as a failure. You will see it in
          the history if you want to know it happened.
        </p>
      </Note>

      <H2>What you cannot change yet</H2>
      <UL>
        <LI>
          <Strong>Per product rates.</Strong> One rate applies to every purchase.
        </LI>
        <LI>
          <Strong>Currencies other than USD.</Strong> A non USD charge is refused
          rather than converted.
        </LI>
        <LI>
          <Strong>Purchase size limits.</Strong> There is no minimum or maximum
          order value, so the only practical limit is the reward falling below
          one unit of the chosen stock.
        </LI>
      </UL>
      <P>
        If any of these is the difference between Equixity working for you and
        not, tell us: they are product decisions rather than limitations of the
        integration.
      </P>
    </DocsArticle>
  );
}
