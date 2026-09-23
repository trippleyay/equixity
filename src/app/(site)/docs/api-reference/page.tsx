import type { Metadata } from "next";
import DocsArticle from "@/components/docs/DocsArticle";
import CodeBlock from "@/components/docs/CodeBlock";
import { A, Code, H2, H3, Note, P, Table } from "@/components/docs/Prose";

export const metadata: Metadata = {
  title: "API reference - Equixity Docs",
  description:
    "Endpoints for reporting orders, reading rewards, and managing merchant settings.",
};

export default function ApiReferencePage() {
  return (
    <DocsArticle
      title="API reference"
      lede="Every endpoint an integration touches. Merchant endpoints are resolved from your signed in session; public endpoints are reachable from a customer's browser and are rate limited individually."
    >
      <H2>Conventions</H2>
      <Table
        head={["Convention", "Detail"]}
        rows={[
          [
            "Base address",
            "https://equixity.app, also shown in your dashboard so it is always correct for your deployment.",
          ],
          [
            "Errors",
            "Every failure returns JSON as { \"error\": \"...\" } with an HTTP status code. Nothing returns a bare status with an empty body.",
          ],
          [
            "Money",
            "Amounts travel as decimal strings, never as JSON numbers, so no value is rounded by a float. The hosted pages show human amounts.",
          ],
          [
            "Caching",
            "Public responses are marked no-store. Reward state is never served from a cache.",
          ],
          [
            "Auth",
            "Merchant endpoints use your session cookie and ignore any merchant id in the body. Public endpoints carry the merchant's public id or an API key.",
          ],
        ]}
      />

      <H2>Merchant endpoints</H2>
      <P>
        These are what the dashboard itself calls. You do not need them to accept
        payments, but they are useful for your own reporting or for pulling reward
        history.
      </P>

      <H3>GET /api/merchant/settings</H3>
      <P>Returns your current reward asset, rate, and whether rewards are on.</P>

      <H3>POST /api/merchant/settings</H3>
      <P>Updates your reward configuration.</P>
      <CodeBlock code={SETTINGS_BODY} label="the settings request body" />
      <Table
        head={["Field", "Type", "Notes"]}
        rows={[
          [
            "reward_asset",
            "string",
            "A ticker from the supported catalog, for example AAPLx.",
          ],
          [
            "reward_bps",
            "integer",
            "The rate in basis points. 100 is 1%. Allowed range 1 to 2000, which is 0.01% to 20%.",
          ],
          ["is_enabled", "boolean", "Whether rewards are issued."],
          [
            "confirmed_customer_eligibility",
            "boolean, optional",
            "Ticking the eligibility statement on the Rewards page sends true here.",
          ],
          [
            "receiving_wallet_address",
            "string, optional",
            "Only used for the direct Solana payment path. Send an empty string to clear it, or omit the field to leave it unchanged.",
          ],
        ]}
      />
      <P>
        Switching rewards on is refused with 400 unless the eligibility statement
        is already confirmed, and the response says so in plain language.
      </P>

      <H3>GET /api/merchant/rewards</H3>
      <P>
        Reward history plus totals for the account. Each entry carries the
        purchase, the asset, the reward value, and its status.
      </P>

      <H3>GET /api/merchant/balance</H3>
      <P>
        <Code>available_usdc_units</Code> as a decimal string. This is the balance
        that backs rewards, after reserved amounts.
      </P>

      <H3>GET /api/merchant/funding</H3>
      <P>
        Synchronises your deposit address against the chain, credits any new
        confirmed transfers, then returns the updated balance and deposit history.
        This is the same call the Funding page makes on load and when you press
        Check for new deposits.
      </P>

      <H3>GET /api/merchant/withdrawals</H3>
      <P>
        Returns your balance, your withdrawal history, and a count of any rows it
        reconciled during the call. Reconciliation here is what stops a
        withdrawal from sitting in a limbo state after an interrupted
        confirmation.
      </P>

      <H3>POST /api/merchant/withdrawals</H3>
      <CodeBlock code={WITHDRAW_BODY} label="the withdrawal request body" />
      <P>
        The amount is checked against your balance atomically at the moment of the
        request, so two concurrent withdrawals cannot both draw on the same funds.
        The destination is validated as a real Solana address before anything is
        signed or spent. A failed send refunds the amount automatically, so a
        withdrawal is never lost in transit.
      </P>

      <H3>GET, POST, DELETE /api/merchant/api-key</H3>
      <Table
        head={["Method", "Result"]}
        rows={[
          ["GET", "Whether a key exists, and its last four characters only."],
          [
            "POST",
            "Generates a key and returns the plaintext once. Any previous key stops working immediately, with no overlap window.",
          ],
          [
            "DELETE",
            "Revokes the key. It stops authenticating as soon as this returns.",
          ],
        ]}
      />
      <P>
        Only a hash of the key is stored, so the plaintext cannot be retrieved
        after the response that created it.
      </P>

      <H3>GET, POST, DELETE /api/merchant/fiat-webhook</H3>
      <P>
        Manages the signing secret for a hosted webhook. Pass{" "}
        <Code>?provider=stripe</Code> or <Code>?provider=flutterwave</Code>.
        Secrets are stored encrypted and never returned by any endpoint: only
        whether one is configured and when it was set. Sending{" "}
        <Code>{"{ \"complete\": true }"}</Code> records that you finished that
        provider's guide, which is what the dashboard reads to show it as set up.
      </P>

      <H3>GET /api/merchant/sdk</H3>
      <P>
        Returns the success page snippet with your merchant id already filled in.
      </P>

      <H2>Public endpoints</H2>
      <P>
        Reachable from a customer's browser, so each one is rate limited and none
        of them trusts a number it is handed. A reward amount is only ever taken
        from a verified chain transaction or from your own authenticated backend.
      </P>

      <H3>POST /api/public/complete-card</H3>
      <P>
        The Checkout API path. Authenticated with{" "}
        <Code>Authorization: Bearer YOUR_API_KEY</Code>; the key is the identity,
        so no merchant id is sent. Body carries{" "}
        <Code>purchaseAmountUsd</Code> and <Code>externalOrderId</Code>. Returns
        the reward reference, its status, the asset, and the reward value.
      </P>
      <P>
        This endpoint is server to server. CORS is deliberately not opened, since
        a browser has no business reporting purchases with a merchant secret.
      </P>

      <H3>GET /api/public/reward-exists</H3>
      <P>
        What the success page notification polls. Takes{" "}
        <Code>merchantId</Code> plus exactly one of{" "}
        <Code>externalOrderId</Code> or <Code>transactionSignature</Code>.
        Answers only whether a claimable reward exists, and returns{" "}
        <Code>{"{ exists: false }"}</Code> otherwise. It never evaluates
        eligibility, never writes a status, and never runs the location check, so
        no compliance state can leak onto your site.
      </P>

      <H3>GET /api/public/reward-status</H3>
      <P>
        The hosted reward page's read. Takes <Code>rewardEventId</Code> and a{" "}
        <Code>view</Code> value identifying the page load. Returns one of{" "}
        <Code>ready</Code>, <Code>claiming</Code>, <Code>delivered</Code>,{" "}
        <Code>failed</Code>, or <Code>blocked</Code>, along with the amount and
        asset so the page can name them. Location is checked fresh on every call.
      </P>

      <H3>POST /api/public/reward-confirm</H3>
      <P>
        Triggers delivery. Body carries <Code>rewardEventId</Code>,{" "}
        <Code>attestationAccepted</Code>, <Code>view</Code>, and for card
        purchases a <Code>walletAddress</Code> with{" "}
        <Code>claimMethod</Code> set to <Code>pasted_address</Code> or{" "}
        <Code>privy_embedded</Code>. The location check runs first, before any
        money moves, whatever an earlier read on the page reported.
      </P>
      <Note title="Access control on the hosted page">
        <p>
          There is no account, no login, and no shared secret. Access is the
          unguessable reward reference itself, which is why the page renders one
          reward and nothing else, and why walking a guessed reference gets a
          plain not found rather than any account detail.
        </p>
      </Note>

      <H3>POST /api/public/complete</H3>
      <P>
        The direct Solana payment path, for checkouts that take Solana payments
        without a card provider. The body carries only a transaction signature,
        and the purchase amount is read from the verified chain transaction
        rather than from the request, so no amount can be claimed. This path
        requires a registered receiving wallet and is not part of the self serve
        dashboard setup.
      </P>

      <H3>POST /api/public/webhooks/stripe/[merchantId]</H3>
      <H3>POST /api/public/webhooks/flutterwave/[merchantId]</H3>
      <P>
        The hosted webhook receivers. Each verifies the processor's own signature
        against the secret you saved before doing anything else, and acts only on
        completed, successful, USD charges. Everything else is acknowledged with
        a success status and ignored, so a processor never retries endlessly for
        an event Equixity does not act on.
      </P>
      <Table
        head={["Situation", "What the receiver returns"]}
        rows={[
          [
            "Signature invalid or secret not configured",
            "An error status, and no reward is created.",
          ],
          [
            "An order already recorded",
            "Success, marked as a duplicate. Nothing is created twice, which is what makes provider retries safe.",
          ],
          [
            "An event Equixity does not act on",
            "Success. Deliberately not an error, so it is never retried.",
          ],
          [
            "A non USD charge",
            "Refused rather than converted.",
          ],
        ]}
      />

      <H2>Rate limits</H2>
      <P>
        Per minute, counted per caller. Exceeding a limit returns 429 with a{" "}
        <Code>Retry-After</Code> header where one is known.
      </P>
      <Table
        head={["Endpoint", "Limit"]}
        rows={[
          ["POST /api/public/complete", "30 per merchant, 60 per IP"],
          ["POST /api/public/complete-card", "60 per API key"],
          ["GET /api/public/reward-exists", "120 per IP"],
          ["GET /api/public/reward-status", "60 per IP"],
          ["POST /api/public/reward-confirm", "10 per IP"],
        ]}
      />
      <P>
        Webhook receivers are not rate limited in this way: they are
        authenticated by signature or secret hash, and a processor legitimately
        bursting deliveries must never be throttled.
      </P>

      <H2>Next</H2>
      <P>
        <A href="/docs/connecting-your-checkout">Connecting your checkout</A> for
        the setup steps, or <A href="/docs/configuring-rewards">
          Configuring rewards
        </A>{" "}
        for what your settings do.
      </P>
    </DocsArticle>
  );
}

const SETTINGS_BODY = `{
  "reward_asset": "AAPLx",
  "reward_bps": 150,
  "is_enabled": true,
  "confirmed_customer_eligibility": true,
  "receiving_wallet_address": ""
}`;

const WITHDRAW_BODY = `{
  "amount_usdc_units": "500000",
  "destination_address": "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
}`;
