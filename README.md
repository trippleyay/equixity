# Equixity

Equixity is an automated rewards platform that delivers real tokenized stock to customers when they make a purchase. Instead of issuing loyalty points that expire or cash back that gets spent immediately, businesses reward shoppers with fractions of public equities and index tokens delivered directly to a wallet they control.

Merchants integrate Equixity without replacing their payment processor or changing how customers pay. Shoppers pay using ordinary cards and standard checkout flows. When an order succeeds, Equixity calculates the reward, reserves the value from the merchant's deposit balance, and lets the customer claim real equity without requiring any prior cryptocurrency experience.

## What problem Equixity solves

Traditional loyalty programs suffer from structural limitations:

- Loyalty points remain trapped inside a single merchant ecosystem and often expire unused.
- Cash back returns nominal currency that disappears into daily spending rather than building lasting value.
- Direct equity ownership has historically required brokerage accounts, investment minimums, geographic paperwork, and active market knowledge.

Equixity transforms customer rewards into lasting assets. By delivering tokenized stock directly to customer-controlled wallets, merchants offer meaningful long-term incentives while maintaining their existing checkout experience.

## How the system works

Equixity connects merchant checkouts, automated asset pricing, Solana on-chain execution, and customer custody:

1. **Merchant funding:** A merchant deposits USDC on Solana to their dedicated, server-managed deposit address. All rewards and withdrawals are funded from this available balance.
2. **Configuration:** The merchant selects a reward asset from a curated catalog (for example, AAPLx or SPYx) and sets a reward percentage between 0.01% and 20.00% of the purchase amount.
3. **Purchase reporting:** When a customer completes checkout, the payment provider sends a webhook to Equixity, or the merchant's server calls the Checkout API.
4. **Reward reservation:** Equixity verifies the purchase amount in US dollars, applies the merchant's reward rate, converts the value to an exact unit count using the current token market price, and reserves the USDC value from the merchant's balance.
5. **Customer notification:** The merchant's order confirmation page loads a lightweight notification snippet (`equixity.js`). The script reads the purchase identifier from the URL and displays a notification linking to Equixity's hosted reward claim page.
6. **Eligibility and compliance:** On the claim page, the customer's region is verified against compliance restrictions, and the customer attests that they are not a resident of restricted markets (such as the United States, United Kingdom, Canada, Australia, Mainland China, or OFAC-sanctioned jurisdictions).
7. **Two-step asset delivery:** Once the customer connects a wallet or enters an email to generate an embedded wallet through Privy, Equixity executes a two-stage transaction:
   - It swaps the reserved USDC into the reward asset through Jupiter Swap API inside the merchant's deposit wallet.
   - It executes a Token-2022 transfer of the reward token from the merchant wallet to the customer's wallet, with Equixity's fee-payer wallet sponsoring the Solana transaction fees and rent.
8. **Customer custody:** Customers can hold their stock or visit the `/wallet` dashboard to view their holdings across merchants and transfer tokens to any external Solana address.

## What is built and working

Every component described below is implemented, tested, and actively operating in the codebase:

### Merchant dashboard and account management
- Email and password authentication powered by Supabase Auth.
- Account overview displaying real-time available balance, configured reward asset, active reward percentage, setup progress, and recent reward events.
- Deposit management with on-demand synchronization against the Solana blockchain (`sync-deposits.ts`) and full transaction history.
- Self-service USDC withdrawals back to any Solana address, signed using the merchant's encrypted deposit keypair and verified on-chain.
- SHA-256 hashed API key generation and revocation for backend integrations.

### Curated asset catalog and price synchronization
- Synchronized catalog combining curated xStocks (equities and ETFs) and PreStocks tokens.
- Automatic synchronization endpoint (`/api/cron/sync-assets`) fetching catalog metadata and live traded token prices.
- Support for Solana Token-2022 program tokens with the Scaled UI Amount extension.
- Internal catalog caching in Postgres so public pages and checkout flows never query third-party APIs during a request.

### Payment provider integrations
- **Stripe:** Hosted webhook endpoint (`/api/public/webhooks/stripe/[merchantId]`) verifying Stripe signatures using HMAC-SHA256 and processing `checkout.session.completed` events.
- **Flutterwave:** Hosted webhook endpoint (`/api/public/webhooks/flutterwave/[merchantId]`) verifying Flutterwave secret hash headers for completed transactions.
- **Checkout API:** Direct server-to-server endpoint (`/api/public/complete-card`) authenticated via bearer API keys for custom e-commerce engines and unsupported payment processors.
- **Success page snippet:** Static client script (`public/equixity.js`) embedded on order confirmation pages. It detects order references (`session_id`, `tx_ref`, or `order_id`), polls the reward availability endpoint, and renders the customer reward notice.


### Customer claim and delivery pipeline
- Hosted claim experience at `/reward/[rewardEventId]`.
- Geographic eligibility screening using IP-based location headers and a deny-list covering restricted jurisdictions.
- Explicit compliance attestation required before any token transfer can occur.
- Flexible wallet options: embedded Solana wallet creation via Privy using email or social login, or direct manual address entry.
- Atomic two-step delivery using Jupiter Swap API and Solana Token-2022 transfers.
- Automated balance protection: if a swap fails on-chain, reserved funds return to the merchant's balance; if an execution is indeterminate, it enters a `claiming` state for reconciliation.
- Dedicated customer wallet portal at `/wallet` allowing customers to view cross-merchant reward history and initiate transfers to external Solana wallets.

### Operational and security infrastructure
- Rate limiting implemented with Upstash Redis across all public endpoints, with fail-closed behavior on production environments.
- Zero plaintext storage of merchant deposit private keys or processor webhook secrets; all sensitive keys are encrypted at rest with AES-256-GCM.
- Independent fee-payer keypair that sponsors transaction fees and token-account rent without holding custody of merchant balances.
- Dedicated internal operations monitor (`/dev-monitor`) protected by secret bearer authentication.

## Dormant features

The codebase retains an earlier on-chain purchase verification route (`/api/public/complete`) designed for customers paying merchants directly in Solana USDC. This route is dormant and intentionally unexposed in the merchant dashboard, setup guides, and documentation. Equixity is focused on fiat payments through card processors and merchant backends.

## Technology stack

Equixity is built on the following technologies:

- **Application framework:** Next.js 16 (App Router) and React 19 in TypeScript.
- **Styling:** Tailwind CSS v4.
- **Database and authentication:** Supabase (PostgreSQL with Row Level Security and Supabase Auth).
- **Blockchain interaction:** Solana Web3.js (`@solana/web3.js`), Solana Kit (`@solana/kit`), and SPL Token (`@solana/spl-token` for Token-2022 program support).
- **RPC infrastructure:** Alchemy Solana RPC (mainnet-beta).
- **DEX routing:** Jupiter Swap API v1.
- **Customer wallet and authentication:** Privy (`@privy-io/react-auth` and `@privy-io/node`).
- **Rate limiting:** Upstash Redis (`@upstash/ratelimit` and `@upstash/redis`).
- **Validation:** Zod 4.

## Merchant integration options

Businesses connect their checkout using one of three methods:

### 1. Stripe Checkout
Merchants using Stripe add an endpoint destination pointing to Equixity's hosted webhook URL in their Stripe dashboard, subscribe to `checkout.session.completed`, and save their webhook signing secret (`whsec_...`) in Equixity. The customer redirect URL is configured to append `session_id={CHECKOUT_SESSION_ID}`, and the merchant adds the single-line script snippet to their thank-you page.

### 2. Flutterwave
Merchants configure Flutterwave webhooks to point to Equixity's Flutterwave webhook URL and enter their secret verification hash in the Equixity dashboard. Flutterwave automatically appends payment references to redirect URLs, allowing the success page snippet to detect completed orders without extra configuration.

### 3. Checkout API
Merchants with custom checkouts or other payment providers generate an API key in the Equixity dashboard. Once payment succeeds on their platform, their backend sends a POST request to `/api/public/complete-card`:

```bash
curl -X POST https://equixity.app/api/public/complete-card \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"purchaseAmountUsd": 42.00, "externalOrderId": "order_1234"}'
```

The response returns the created reward ID and claim URL. The merchant can display this link directly to the customer or use the success page snippet with `?order_id=order_1234`.

## Customer experience

1. **Checkout:** The customer purchases items on the merchant's store using standard checkout and payment methods.
2. **Notification:** On the order confirmation page, the Equixity badge informs the customer that they have earned stock rewards.
3. **Claim:** Clicking the notification opens `/reward/[rewardEventId]`.
4. **Verification:** The customer reviews their reward value, confirms their geographic eligibility, and enters their destination wallet address or signs in via Privy to generate a new wallet.
5. **Receipt:** Equixity completes the swap and transfers the tokens. The customer receives confirmed on-chain stock tokens and can manage or export them at any time via `/wallet`.

