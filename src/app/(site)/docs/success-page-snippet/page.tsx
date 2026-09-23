import type { Metadata } from "next";
import DocsArticle from "@/components/docs/DocsArticle";
import CodeBlock from "@/components/docs/CodeBlock";
import {
  A,
  H2,
  LI,
  Note,
  P,
  Strong,
  Table,
  UL,
} from "@/components/docs/Prose";

export const metadata: Metadata = {
  title: "The success page snippet - Equixity Docs",
  description:
    "One line of HTML on your thank you page, and how that page finds out which purchase it belongs to.",
};

const SNIPPET = `<script src="https://equixity.app/equixity.js" data-merchant-id="YOUR_MERCHANT_ID"></script>`;

export default function SuccessPageSnippetPage() {
  return (
    <DocsArticle
      title="The success page snippet"
      lede="One line of HTML on the page a customer lands on after paying. It shows them they earned something, and it is the only code Equixity asks you to add."
    >
      <H2>The snippet</H2>
      <P>
        Copy it from your dashboard so the merchant id matches your account, then
        paste it anywhere inside the page that loads after a successful payment.
      </P>
      <CodeBlock code={SNIPPET} label="the success page snippet" />
      <P>
        It goes in once. It never changes per order, and it never needs updating
        when you change your stock, your rate, or your payment provider.
      </P>
      <Note title="It is safe to paste anywhere on your site">
        <p>
          The snippet carries only your public merchant id, which is also visible
          in the page source. It cannot be used to read your account, change your
          settings, move money, or read any customer data. On a page that has no
          order reference on it, it does nothing at all.
        </p>
      </Note>

      <H2>How the page knows which order it is about</H2>
      <P>
        The script reads the order reference out of the page address, and each
        payment provider supplies it without you editing anything per order.
      </P>
      <Table
        head={["Your setup", "What appears in the address", "What you do"]}
        rows={[
          [
            "Stripe",
            "?session_id=cs_live_...",
            "Add session_id={CHECKOUT_SESSION_ID} to the return address on your payment link or checkout. Stripe fills the value in itself.",
          ],
          [
            "Flutterwave",
            "?tx_ref=...",
            "Nothing. Flutterwave adds the reference when it redirects the customer.",
          ],
          [
            "Checkout API",
            "?order_id=...",
            "Send the customer to the page with the same order id your backend reported to Equixity.",
          ],
        ]}
      />
      <P>
        If your payment provider already redirects customers to your own page,
        you are already most of the way there: the change is one value on an
        address you already set.
      </P>

      <H2>What the customer sees</H2>
      <P>
        A small notification appears once the reward exists, saying what they
        earned and which stock it is. Tapping it opens the reward page where they
        claim it. Until the reward exists, the page looks exactly as it did
        before.
      </P>
      <P>
        The reward exists as soon as Equixity has been told the order completed.
        That is usually immediate, so the notification appears without the
        customer waiting. The script checks every three seconds for up to three
        minutes, which covers a slow provider notification, and then stops.
      </P>

      <H2>When nothing appears</H2>
      <P>
        The script fails quietly and explains itself in the browser console
        rather than writing an error onto your customer's page. The three cases
        worth knowing:
      </P>
      <UL>
        <LI>
          <Strong>No order reference in the address.</Strong> One console line
          naming exactly what to add for your provider. No network requests are
          made at all.
        </LI>
        <LI>
          <Strong>Rewards are switched off, or the reward was blocked.</Strong>{" "}
          Silence, by design. Your customer sees no message about a reward they
          are not receiving.
        </LI>
        <LI>
          <Strong>A cancelled payment.</Strong> Flutterwave redirects cancelled
          payments to the same address, tagged as cancelled. The script
          recognises that and stays quiet rather than waiting three minutes for
          a reward that will never exist.
        </LI>
      </UL>
      <Note title="A template value left in by mistake">
        <p>
          If the address still contains the literal text{" "}
          <Strong>CHECKOUT_SESSION_ID</Strong> or{" "}
          <Strong>ORDER_ID</Strong>, the script says so specifically instead of
          treating it as a real order. This normally means the placeholder was
          pasted where the live value should be, or added twice to the same
          address.
        </p>
      </Note>

      <H2>Rules that keep it working</H2>
      <UL>
        <LI>
          <Strong>One kind of reference per page.</Strong> An address carrying
          both a card reference and a Solana signature is refused, with a console
          message saying so.
        </LI>
        <LI>
          <Strong>Different pages can carry different providers.</Strong> If you
          take Stripe on one checkout and something else on another, the script
          detects which reference is present.
        </LI>
        <LI>
          <Strong>Do not put the snippet on a page that no payment leads to.</Strong>{" "}
          It has nothing to report without an order reference and will simply do
          nothing.
        </LI>
      </UL>

      <H2>Next</H2>
      <P>
        <A href="/docs/connecting-your-checkout">Connecting your checkout</A> has
        the setup steps for each provider, ending with this snippet.
      </P>
    </DocsArticle>
  );
}
