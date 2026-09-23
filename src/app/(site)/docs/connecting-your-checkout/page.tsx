import type { Metadata } from "next";
import DocsArticle from "@/components/docs/DocsArticle";
import CodeBlock from "@/components/docs/CodeBlock";
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
  title: "Connecting your checkout - Equixity Docs",
  description:
    "Webhook setup for Stripe and Flutterwave, or reporting completed orders from your own backend.",
};

const STRIPE_URL =
  "https://equixity.app/api/public/webhooks/stripe/YOUR_MERCHANT_ID";

const FLUTTERWAVE_URL =
  "https://equixity.app/api/public/webhooks/flutterwave/YOUR_MERCHANT_ID";

export default function ConnectingYourCheckoutPage() {
  return (
    <DocsArticle
      title="Connecting your checkout"
      lede="Three ways to tell Equixity that an order completed. All of them end with the same snippet on your success page, and none of them change how your customers pay."
    >
      <H2>Which one is yours</H2>
      <Table
        head={["Option", "Who it is for", "Work involved"]}
        rows={[
          [
            "Stripe",
            "Stores using Stripe Checkout",
            "Two values pasted between dashboards. No code.",
          ],
          [
            "Flutterwave",
            "Stores using Flutterwave",
            "Two values pasted between dashboards. No code.",
          ],
          [
            "Checkout API",
            "Custom checkouts, or a provider not listed here",
            "One API call from your backend after payment succeeds.",
          ],
        ]}
      />
      <P>
        The dashboard walks you through whichever you pick, one step at a time.
        This page is the same information in one place, plus the detail that
        matters when something behaves unexpectedly.
      </P>

      <H2>Stripe</H2>
      <P>
        Equixity hosts an endpoint that Stripe calls when a payment completes.
        That is the whole integration: tell Stripe where to call, and give
        Equixity the secret Stripe signs those calls with.
      </P>
      <H3>Step 1: add the endpoint in Stripe</H3>
      <P>
        In Stripe, go to Developers, then Webhooks, then Add endpoint, and paste
        the address your dashboard shows you. It looks like this:
      </P>
      <CodeBlock code={STRIPE_URL} label="the Stripe webhook address" />
      <H3>Step 2: select the event and copy the signing secret</H3>
      <P>
        Under events, select <Strong>checkout.session.completed</Strong>. Click
        Add endpoint, then copy the signing secret Stripe shows you. It starts
        with <Strong>whsec_</Strong>. Paste it into the Stripe step in your
        dashboard.
      </P>
      <H3>Step 3: send customers back with the order reference</H3>
      <P>
        The address Stripe sends customers to after paying has to carry the order
        reference. If it already ends in{" "}
        <Strong>session_id=&#123;CHECKOUT_SESSION_ID&#125;</Strong>, change
        nothing. If it does not, add that to the return address on your payment
        link or in your checkout settings. If the address already contains a
        question mark, use an ampersand instead of a second question mark.
      </P>
      <H3>Step 4: the snippet</H3>
      <P>
        Paste the success page snippet onto the page Stripe sends customers to.
        See <A href="/docs/success-page-snippet">The success page snippet</A>.
      </P>
      <Note title="Two Stripe specific details">
        <p>
          Only USD charges create a reward. A charge in another currency is
          refused rather than converted. And Stripe retries failed webhook
          deliveries, which is harmless here: a retried order is recognised as
          already recorded and never creates a second reward.
        </p>
      </Note>

      <H2>Flutterwave</H2>
      <P>
        The same idea as Stripe, with one difference: instead of Flutterwave
        generating a signing secret, you set a secret hash and both sides use it.
        Equixity generates the value for you so there is nothing to invent.
      </P>
      <H3>Step 1: add the webhook in Flutterwave</H3>
      <P>
        In your Flutterwave webhook settings, paste the address your dashboard
        shows you:
      </P>
      <CodeBlock
        code={FLUTTERWAVE_URL}
        label="the Flutterwave webhook address"
      />
      <P>
        Leave the event boxes ticked. Equixity acknowledges every event it
        receives and acts only on successful charges, so extra events are noise
        rather than a problem.
      </P>
      <H3>Step 2: the secret hash</H3>
      <P>
        Copy the hash your dashboard generates, paste it into the Secret hash
        field in Flutterwave, and click Save there. Then move to the next step in
        the Equixity guide, which saves it on our side too. The two values have
        to match exactly, since that is how Equixity knows a webhook really came
        from Flutterwave.
      </P>
      <P>
        You can replace the hash at any time, and the guide has a remove option
        if you stop using Flutterwave.
      </P>
      <H3>Step 3: the snippet</H3>
      <P>
        Paste the success page snippet onto the page your redirect address
        already points to. Nothing needs adding to that address: Flutterwave
        appends the order reference itself when it redirects.
      </P>
      <Note title="Two Flutterwave specific details">
        <p>
          Only USD charges create a reward. And because Flutterwave can redirect
          a cancelled payment to the same address as a successful one, Equixity
          reads the status it sends and stays quiet when the payment did not
          complete.
        </p>
      </Note>

      <H2>Checkout API</H2>
      <P>
        For a custom checkout, or a provider Equixity does not host a webhook
        for. Your backend reports each completed order, and Equixity creates the
        reward. This is the most flexible option and the only one that needs
        code.
      </P>
      <H3>Step 1: generate an API key</H3>
      <P>
        In the Checkout API tab, press Generate API key and copy it immediately.
        Only the last four characters are stored, so it cannot be shown again. If
        you lose it, generate a new one: the old key stops working the moment the
        new one exists.
      </P>
      <P>
        Treat the key like a password and keep it server side. Anyone holding it
        can report purchases, which spends your reward balance.
      </P>
      <H3>Step 2: report completed orders</H3>
      <P>
        After a payment succeeds, call Equixity from your backend. The API key is
        the identity, so there is no merchant id in the request.
      </P>
      <CodeBlock code={CURL_EXAMPLE} label="the Checkout API example" />
      <UL>
        <LI>
          <Strong>purchaseAmountUsd</Strong> is the order total in US dollars,
          for example <Strong>42.00</Strong>.
        </LI>
        <LI>
          <Strong>externalOrderId</Strong> is your own order identifier. It has
          to be unique per order: it is what stops a retry or a duplicate call
          from issuing a second reward, so send the same value if you send the
          same order twice.
        </LI>
      </UL>
      <P>The response carries the reward reference and its value:</P>
      <CodeBlock code={RESPONSE_EXAMPLE} label="the Checkout API response" />
      <H3>Step 3: the snippet</H3>
      <P>
        Send the customer to your thank you page with the same order id in the
        address, then paste the success page snippet there. See{" "}
        <A href="/docs/success-page-snippet">The success page snippet</A>.
      </P>
      <Note title="If you would rather not run the snippet">
        <p>
          The response includes a reward reference, and the hosted reward page
          lives at <Strong>/reward/</Strong> followed by that reference. You can
          link the customer straight to it from your own confirmation page and
          skip the snippet entirely. That page handles the whole hand over, so
          linking to it is a complete integration on its own.
        </p>
      </Note>

      <H2>Next</H2>
      <P>
        <A href="/docs/api-reference">API reference</A> lists every endpoint,
        with request shapes, responses, and rate limits.
      </P>
    </DocsArticle>
  );
}

const RESPONSE_EXAMPLE = `{
  "rewardEventId": "8f14e45f-ceea-467a-9e1f-1b2c3d4e5f60",
  "status": "pending",
  "rewardAsset": "AAPLx",
  "assetName": "Apple Inc.",
  "rewardAmount": "0.0121",
  "rewardUsdcValue": "2.400000"
}`;

const CURL_EXAMPLE = `curl -X POST https://equixity.app/api/public/complete-card \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"purchaseAmountUsd": 42.00, "externalOrderId": "order_1234"}'`;
