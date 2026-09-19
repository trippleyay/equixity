# Equixity

A loyalty platform where businesses reward customers with **real tokenized stocks**
instead of points or cash. This repo is the complete product:

- **Merchant side** — account, reward configuration, funding (a personal deposit
  address), self-service USDC withdrawals, a synced 50-asset reward catalog, a
  merchant API key for card processors, and the checkout SDK.
- **Customer side** — the public claim page, wallet connect / Privy embedded
  wallets, the eligibility gate, and swap-at-claim execution that delivers the
  reward asset on-chain.

## Stack

Next.js 16 (App Router) + TypeScript, Tailwind CSS v4, Vercel, Supabase
(Postgres + Auth), Alchemy Solana RPC (mainnet-beta), `@solana/web3.js` v1
(1.99.x), `@solana/spl-token` 0.4.x, Jupiter Swap API v1, Privy, Upstash Redis
(rate limiting), Zod 4. All server logic lives in Next.js Route Handlers; there
is no separate backend.

## Environment

Copy `.env.example` to `.env.local` and fill it in.

| Var | Where to get it | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | public (ships to browser) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Connect dialog (also called "anon key") | public |
| `SUPABASE_URL` | same as above | server-only |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API | **server-only, must never be `NEXT_PUBLIC_`** |
| `ALCHEMY_SOLANA_RPC_URL` | Alchemy app → Solana mainnet-beta | **server-only** |
| `DEPOSIT_KEY_ENCRYPTION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | **server-only** AES-256 key (64 hex) |
| `FEE_PAYER_SECRET_KEY` | generate a keypair, base58 of its 64-byte `secretKey` | **server-only** pays gas/rent |
| `NEXT_PUBLIC_APP_URL` | your app origin | SDK snippet + claim links; defaults to `https://equixity.app` |
| `JUPITER_API_KEY` | developers.jup.ag/portal | **server-only**; required by Jupiter's current Swap API, free tier included |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy dashboard | public by design (the client SDK needs it) |
| `PRIVY_APP_SECRET` | Privy dashboard | **server-only**; verifies Privy tokens |
| `CRON_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | **server-only**; gates the catalog sync route |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | upstash.com → Redis → REST API | **server-only**; rate limiting |

Two wallets are involved and they have very different risk profiles:

- `FEE_PAYER_SECRET_KEY` is the Equixity-controlled wallet that covers the SOL
  network fee (and the one-time token-account rent when a destination has never
  held the asset) on withdrawals **and** reward swaps. It must never hold transfer
  authority over any merchant's USDC. Worst case if compromised: a small SOL
  balance is drained, never merchant funds. Keep a small SOL balance on it.
- Per-merchant deposit keypairs are AES-256-GCM encrypted at rest and never
  returned by any API.

Secrets are read only in server-side code — see `src/lib/env.ts`. Values never
carry a `NEXT_PUBLIC_` prefix, and `.env.local` is gitignored.

## Install & run

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

## Database

Migrations live in `supabase/migrations/`, ordered by timestamp. Apply them to
your hosted project with the Supabase CLI:

```bash
export SUPABASE_ACCESS_TOKEN="$YOUR_PERSONAL_ACCESS_TOKEN"
supabase link --project-ref "$PROJECT_REF"
supabase db push --password "$DB_PASSWORD"   # dry run first: add --dry-run
```

Notes:

- All money is `bigint` base units (1 USDC = 1_000_000 units). No floats. Reward
  *prices* are the one deliberate exception (`numeric(20,8)`), because they are
  display/calc values rather than ledger entries — and even those are transported
  as text and divided with integer math.
- RLS is enabled on **every** table. Merchant-scoped tables are visible only
  where their `merchant_id` resolves to `auth.uid()`. Two tables have RLS enabled
  with **zero policies** because only the service role may touch them:
  `merchant_deposit_accounts` (it holds encrypted private keys) and
  `reward_assets` (shared catalog, read server-side only).
- `merchants.public_id` is the public, snippet-safe identifier. The internal PK is
  never embedded in a snippet and never accepted from a client.
- `reward_events.status` includes `ineligible` (compliance block) and
  `rewards_disabled` (purchased while the merchant's toggle was off) so no row can
  sit at an undefined `pending` forever.
- Reward-asset mints are **Token-2022**. Any code reading those mints or building
  transfers against them must use `TOKEN_2022_PROGRAM_ID`, never
  `TOKEN_PROGRAM_ID`. USDC is a legacy SPL Token mint and uses the legacy program.

## Architecture

### Asset catalog (synced, not polled)

The catalog is **scheduled**, not poll-on-view: it is shared public data, so
hitting both upstream APIs on every page load would be wasteful and eventually
rate-limited. Instead:

- `GET /api/cron/sync-assets` (gated on `CRON_SECRET`) fetches both upstreams and
  upserts into `reward_assets`. Every part of the app reads that cached table —
  never an upstream API at request time.
- Two upstream shapes are normalized behind one adapter interface:
  - **xStocks** (`api.xstocks.fi/api/v2/public/assets`) — paginated
    `{nodes, page}`. `symbol` is suffixed (`AAPLx`), `underlyingSymbol` is plain
    (`AAPL`), the Solana mint lives in `deployments[]`, and **there is no price in
    the list response at all** — prices come from a separate per-asset call
    (`{quote: 762.885}`). Pagination also fails *silently*: `pageSize` above 100
    returns an empty `nodes` array with HTTP 200, so the adapter pages at 100 and
    treats an empty page as a hard error rather than "the catalog is empty".
  - **PreStocks** (`prestocks.com/api/prestocks`) — a bare JSON array, unsuffixed
    `symbol`, `contract_address` mint, and the price inline as `tokenPrice`
    (`markPrice` is deliberately ignored — the traded price is required, not the
    issuer's mark).
- Curation lives in `src/lib/asset-curation.ts` as a plain array (one-line edits,
  no migration). Tickers are stored exactly as each API returns them, matching the
  rows already live in the database.
  - The spec's list contained `COST` and `SHOP`, **neither of which exists** in
    xStocks' live 928-asset catalog. They were replaced with `PLTR` and `SBUX`,
    both verified present with Solana deployments.
- Decimals are read on-chain via `getMint(..., TOKEN_2022_PROGRAM_ID)` and cached
  by mint, because decimals are immutable — only newly-seen mints cost an RPC
  call.

**The 5-minute schedule runs outside Vercel.** Vercel's Hobby plan limits cron
jobs to once per day, and a five-minute cron expression *fails deployment* on
Hobby. So `.github/workflows/sync-assets.yml` calls the same
`CRON_SECRET`-gated route every 5 minutes. The route is identical either way, so
switching to Vercel Cron later needs no code change.

Required repo secrets for that workflow: `EQUIXITY_APP_URL` and `CRON_SECRET`.

### Purchase verification — two first-class paths

**On-chain path** — `POST /api/public/complete`
(body `{ merchantId, transactionSignature }`). Public and unauthenticated by
necessity (it is called from arbitrary customer checkout pages), so it resolves
the merchant by public id, is rate-limited per IP and per merchant, and **never
reads an amount from the request body**. It verifies a USDC transfer to the
merchant's registered `receiving_wallet_address` and reads the amount from the
transaction itself. As with the funding sync, the destination is the wallet's
USDC **ATA**, not the wallet pubkey, so the check measures the balance delta on
the derived ATA. `maxSupportedTransactionVersion: 0` is set — without it every
versioned transaction would look like "not found".

**Traditional-processor path** — `POST /api/public/complete-card`
(`Authorization: Bearer <api_key>`, body
`{ purchaseAmountUsd, externalOrderId }`). This is the path most real merchants
will use. The API key *is* the merchant identity, looked up by SHA-256 hash (a
fast hash is correct for a 256-bit random secret — a slow password hash would add
latency for no gain). A missing or unrecognised key is **401, never 404**, so the
response cannot distinguish "wrong format" from "no such key". Idempotency is
`(merchant_id, external_order_id)`.

This path trusts the merchant's own backend for the amount — the spec names that
as its actual security tradeoff, and the bound is that a merchant abusing it only
spends their own already-funded USDC balance, never anyone else's.

Key management lives on the **Account** page: generated in the dashboard, shown in
full exactly once, and only the last four characters afterwards. Regenerating
invalidates the previous key immediately — there is no dual-key grace period.

Amounts are stored in the unit each path naturally produces, in separate columns
rather than one overloaded one: the on-chain path writes
`purchase_amount_usdc_units` (base units, read from the chain), the card path
writes `purchase_amount_cents` (what Stripe-style APIs report). 1 cent = 10,000
USDC base units, so they are not interchangeable and no lossy conversion exists
between them.

### Eligibility gating

The gate sits **between** the claim page and swap execution. Swap execution can
never run without it, and it runs on **every** claim — never cached per merchant
or per customer, because IP location and jurisdiction can change between claims.

- **Merchant side** — `merchants.confirmed_customer_eligibility`. The Rewards
  settings API refuses `is_enabled: true` unless it is `true`; the disabled
  checkbox in the UI is presentation, not the control. Every merchant, past and
  future, must attest — migration `…02` forces `is_enabled = false` for any
  merchant that has not, deliberately with no grandfathering.
- **Shopper side** — Vercel geolocation (`x-vercel-ip-country` / the
  `geolocation()` helper from `@vercel/functions`) checked against a deny list in
  `src/lib/compliance/restricted-countries.ts`, plus the required attestation
  checkbox, plus static sanctioned-address screening.
- `ineligible` is a **terminal** status distinct from `failed` — a compliance
  block is not a technical failure, and they are never conflated in code or data.
  It touches no balance at all.

**Deliberate sequencing choice.** Because `ineligible` is terminal, a page *view*
must not be able to set it: a stray VPN blip or a flaky corporate proxy would
otherwise permanently kill a legitimate claim. So a page load only *records* the
detected country (`POST /api/public/claim-view`), and the actual gate runs on
**claim submit** with a fresh re-check.

**Missing-country policy.** Vercel's geo headers are not populated on localhost
and geolocation does not work behind a proxy, so an unknown country is a real
case: in production it **fails closed**; outside production it is allowed but
still recorded, so local development stays testable.

**Sanctioned-wallet screening — which path was taken.** The hand-maintained
config list, as the spec permits. Syncing was checked and genuinely needs more
than it looks: OFAC's Sanctions List Service XML export returns
`{"message":"Forbidden"}` to server requests, the legacy `sdn.csv` that does
respond is name-based and carries no digital-currency addresses, and the
addresses live in a large XML document needing real parsing plus periodic
refresh. The mechanism is in place and the list is **intentionally empty** rather
than seeded with invented addresses, which would give false assurance and risk
blocking innocent wallets. Populate it from OFAC's published data — one file, no
schema change.

### Claim page and swap execution

`/claim/[rewardEventId]` is public with no account required. Access control is
the unguessable UUID itself, which is why only that one reward is ever rendered
or returned.

Two claim paths, both ending in the same thing — a customer wallet address:

- **Connect an existing Solana wallet** via wallet-adapter. This is the one place
  in the app where a standard Connect Wallet flow is right, since the entire point
  is obtaining an address to send funds to.
- **Sign in with email/Google (Privy)** for an embedded Solana wallet. The address
  is resolved **server-side** from the verified Privy user record
  (`privy.users().get({ id_token })`, after token verification), so the browser is
  never trusted as the source of a money destination. Uses the current
  `@privy-io/node` — `@privy-io/server-auth` is deprecated on npm, and
  `verifyAuthToken` is deprecated in favour of `verifyAccessToken`.

Swap execution (`src/lib/solana/reward-swap.ts`) reuses the withdraw
infrastructure rather than inventing a parallel mechanism:

1. `reserve_reward_for_claim()` sets the claim to `claiming` **and** debits the
   balance atomically, in one function call.
2. The merchant's deposit keypair is decrypted (same path as withdraw).
3. Jupiter returns a quote and raw instructions; they are assembled into a
   transaction with the **Equixity fee payer** as fee payer, then signed by the
   merchant key and the fee payer.
4. **Delivery is two-step**, because Jupiter's `destinationTokenAccount` requires
   an already-initialized token account and a first-time customer will not have
   one: swap into the merchant's own wallet, then `transferChecked` to the
   customer's ATA, created idempotently with the fee payer covering rent. Both
   instructions use `TOKEN_2022_PROGRAM_ID`, because reward assets are Token-2022.
5. Outcomes are never assumed: confirmed → `delivered`; definitively not landed →
   `failed` **and refunded exactly once**; indeterminate → left `claiming` for
   reconciliation on a later Funding-page view.

`/swap-instructions` is used rather than the assembled `/swap` endpoint
specifically for fee-payer control: `/swap` hardcodes the caller as fee payer, and
a deposit address holds no SOL.

Jupiter v1 is used deliberately. The newer v2 "Metis" `/build` path returns raw
instruction arrays shaped for `@solana/kit` (web3.js v2), which would mean running
a second, parallel Solana stack alongside this app's web3.js v1 + spl-token code.

**One money rule worth stating plainly.** If the swap lands but delivery to the
customer fails, the reward is **not** refunded as USDC — the merchant now holds
the swapped asset, so refunding would pay them twice. That case fails with no
refund and records why, and the swap signature is stored the moment it exists so
it can always be traced on-chain.

### Reward math and units

- The USDC side is bigint base units throughout, and the reward rate is applied
  with integer division that truncates — a reward can never be over-issued
  relative to the USDC value backing it.
- The asset side is computed in **UI/scaled units**, because both upstreams quote
  their price per displayed unit.
- Conversion to **raw base units** happens once, at the end, via
  `@solana/spl-token`'s extension-aware helper
  (`uiAmountToAmountForMintWithoutSimulation`). That matters because both asset
  families carry Token-2022's Scaled UI Amount extension, whose multiplier drifts
  from 1.0 over time — that is how splits and dividends are reflected without
  moving tokens. The multiplier math is never hand-rolled.
- `reward_events.reward_usdc_units` stores the USDC value earmarked at purchase
  time, because that is what the swap must spend. Recomputing it later from the
  merchant's *current* rate would silently re-price old rewards, and inverting the
  asset quantity through a since-moved price would reintroduce error.

### Rate limiting

The two endpoints that gate real money are rate-limited with Upstash Redis
(`@upstash/ratelimit`, sliding window): `/api/public/complete` per IP and per
merchant, `/api/public/complete-card` per API key, `/api/public/claim` per IP,
and Privy token verification per IP.

This one is built for real rather than accepted as a gap, unlike the funding-sync
endpoint: those could only ever *read* chain data, whereas these directly decide
whether money leaves a merchant's balance.

If Upstash is not configured, the limiter **fails closed on production** rather
than silently waving requests through; outside production it allows with a
warning so local development is not blocked.

## The checkout SDK

`public/equixity.js` is served statically at `/equixity.js`. A merchant pastes the
snippet from the Rewards page, which carries only their public merchant id:

```html
<script src="https://YOUR_APP/equixity.js" data-merchant-id="MERCHANT_ID"></script>
```

Then, after a successful checkout:

```js
Equixity.complete({
  transactionSignature: "5x...",
  onSuccess: (reward) => {
    // reward.claimUrl is the customer's claim link
  },
  onError: (err) => console.error(err),
});
```

The SDK **calculates nothing** — it posts the signature and displays what the
backend verified, so the numbers it shows can never drift from what was actually
checked. It derives its API origin from its own `<script src>`, so local and
preview deployments work unchanged. It fails loudly in devtools if
`data-merchant-id` is missing rather than silently no-op'ing.

The endpoint it calls is CORS-open by design (`*`, no credentials) since it is
called from arbitrary merchant checkout pages — safe because it carries no session
or cookies.

## Dashboard

| Route | Purpose |
| --- | --- |
| `/` | marketing / entry |
| `/login` | merchant email + password sign-in (Supabase Auth) |
| `/dashboard` | overview: balance, reward config, setup blockers, recent activity |
| `/dashboard/rewards` | asset table, reward rate, receiving wallet, eligibility attestation, SDK snippet |
| `/dashboard/funding` | deposit address, "check for new deposits", withdrawals, claim reconciliation |
| `/dashboard/account` | merchant id, deposit address, API key management, sign out |
| `/claim/[rewardEventId]` | public customer claim page |

Every dashboard route resolves the merchant from the authenticated session
server-side. No route ever accepts a merchant id from a client — the sole
exception is the public verification path, which resolves by *public* id because
there is no session there by design.

## Security notes

- The service-role key, the AES key, the Alchemy URL, the fee-payer key, the
  Jupiter key, the Privy secret and the cron secret are server-only and are never
  read in a `"use client"` component.
- Deposit private keys are AES-256-GCM encrypted at rest with a self-describing
  payload, authenticated so tampered ciphertext cannot yield a keypair, and are
  never returned by any API response.
- Merchant API keys are stored only as SHA-256 hashes.
- Money movement always lands in a defined terminal or reconciliation state —
  `delivered` / `failed` / `ineligible` / `rewards_disabled` / `claiming`-pending.
  Nothing can be silently stuck, and nothing is ever refunded while the chain
  might still have executed it.