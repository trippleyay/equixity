# Equixity — Merchant MVP

A loyalty platform where businesses reward customers with real tokenized stocks
(SPYx, AAPLx, NVDAx) instead of points or cash. This repo is the **merchant side**:
account, reward configuration (with an enable/disable toggle), funding (a personal
deposit address), self-service USDC withdrawals, the SDK snippet, and the activity
view.

Customer claim flow, wallet creation, swap execution, and purchase-verification
backends are out of scope for this build and are not present.

## Stack

Next.js 16 (App Router) + TypeScript, Tailwind CSS v4, Vercel, Supabase
(Postgres + Auth), Alchemy Solana RPC (mainnet-beta), `@solana/web3.js` v1
(1.99.x — the npm `latest` tag), `@solana/spl-token`, Zod 4. All server logic
lives in Next.js Route Handlers; there is no separate backend.

## Environment

Copy `.env.example` to `.env.local` and fill it in. The app is wired to these
named env vars:

| Var | Where to get it | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | public (ships to browser) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Connect dialog (also called "anon key") | public |
| `SUPABASE_URL` | same as above | server-only |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API | **server-only, must never be `NEXT_PUBLIC_`** |
| `ALCHEMY_SOLANA_RPC_URL` | Alchemy app → Solana mainnet-beta | **server-only** |
| `DEPOSIT_KEY_ENCRYPTION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | **server-only** AES-256 key (64 hex) |
| `FEE_PAYER_SECRET_KEY` | generate a keypair, base58 of its 64-byte `secretKey` | **server-only** pays withdrawal gas/rent |
| `NEXT_PUBLIC_APP_URL` | your app origin | SDK snippet base; defaults to `https://equixity.app` |

`FEE_PAYER_SECRET_KEY` is the Equixity-controlled wallet that covers the SOL network
fee (and, only when a withdrawal destination has never held USDC, the one-time
token-account rent) on every withdrawal. It must never hold transfer authority
over any merchant's USDC; keep a small SOL balance on it via ops (worst case if
compromised: a drained SOL balance, never merchant funds).

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

Migrations live in `supabase/migrations/` (schema → RLS → plpgsql functions),
ordered by timestamp. Apply them to your hosted project with the Supabase CLI:

```bash
export SUPABASE_ACCESS_TOKEN="$YOUR_PERSONAL_ACCESS_TOKEN"
supabase link --project-ref "$PROJECT_REF"
supabase db push --password "$DB_PASSWORD"   # dry run first: add --dry-run
```

Notes:
- All money is `bigint` base units (1 USDC = 1_000_000 units). No floats.
- RLS is enabled on every merchant-scoped table; a row is visible/mutable only
  where its `merchant_id` resolves to `auth.uid()`. `merchant_deposit_accounts`
  has RLS enabled with no policies (service-role only — its
  `encrypted_private_key` is never returned by any API).
- `merchants.public_id` is the public, snippet-safe identifier (the PK is
  internal and never embedded in the snippet). `public_id` is never used for
  authorization.

The three reward-asset mints (SPYx/AAPLx/NVDAx) are Token-2022 tokens. Before
broadening beyond USDC they must be re-verified on-chain against their mints
using `TOKEN_2022_PROGRAM_ID`; this build only moves USDC.

## Architecture

Everything merchant-scoped starts from `requireMerchant()` in
`src/lib/auth/require-merchant.ts`, which resolves the merchant from the
authenticated Supabase session **server-side** (a client-supplied merchant ID
is never accepted) and JIT-provisions the merchant record + deposit account +
settings + balance together on first sign-in. Reads/writes go through the
service layer (`src/lib/services/merchant.ts`) using the service-role client.

### API routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/merchant/settings` | GET / POST | read / update `reward_asset` + `reward_bps` (Zod + DB bound 1–2000 bps) |
| `/api/merchant/balance` | GET | current USDC balance |
| `/api/merchant/funding` | GET | poll-on-view deposit detection, then balance + history |
| `/api/merchant/rewards` | GET | this merchant's `reward_events` (empty) + totals |
| `/api/merchant/sdk` | GET | the generated checkout snippet string |
| `/api/merchant/withdrawals` | GET / POST | list + reconcile, or execute a self-service withdrawal |

`GET /api/merchant/funding` looks up the merchant's deposit address, computes its
USDC associated token account, fetches confirmed signatures (wallet **and** ATA —
inbound USDC transfers list the ATA, not the wallet, in `account_keys`), parses
each new signature, and for each confirmed net USDC credit calls the atomic
`credit_funding()` plpgsql function (insert + balance increment in one call).
It only costs RPC calls when someone opens the Funding page — no cron, no
webhook.

### Rewards toggle

`merchant_settings.is_enabled` (default `true`) is an on/off switch for a
merchant's rewards — they can pause earning without losing their asset/rate
selection. It is stored and surfaced in the dashboard (Rewards page + an
Overview indicator). It has **no runtime consumer yet**: the customer-side
purchase engine (out of scope) is what will read it, so today it exists so the
config is in place when that side is built.

### Withdrawals (self-service)

A merchant pulls their USDC balance out to any external Solana address, in real
time. `merchant_deposit_accounts` holds each merchant's own keypair; the
withdrawal is signed by that keypair, and a separate Equixity-controlled
**fee payer** (`FEE_PAYER_SECRET_KEY`) covers only the SOL fee/rent — it has no
authority over any merchant's USDC.

Flow, per `POST /api/merchant/withdrawals`:
1. Departure address is checked to be a well-formed base58 pubkey — an invalid
   address never spends a lamport (400).
2. `reserve_withdrawal()` debits the balance and creates a `pending` row
   atomically. Two concurrent requests cannot both clear the same funds; an
   overdraft returns 409 with nothing debited.
3. The merchant's decrypted keypair signs the transfer; the fee payer pays.
   If the destination has never held USDC, an idempotent ATA-creation
   instruction covers the one-time rent.
4. On any post-broadcast failure the app checks `getSignatureStatuses` before
   acting: confirmed stays confirmed; a transfer the chain definitively never
   executed is failed **and** refunded exactly once; an indeterminate outcome
   is left `submitted` for reconciliation on the next Funding-page view — a
   transaction that might land is never refunded.

Lifecycle: `pending → submitted → confirmed | failed`. `failed` rows carry a
reason and refund the reserved amount (`fail_withdrawal` is idempotent — a
settled row is never double-refunded). The deposit-key decrypt path that backs
this (`decryptSecretKey`) is verified against a real provisioned row via
`npm run verify:deposit-key-roundtrip`.

### SDK

Served statically at `/equixity.js`:

```html
<script
  src="https://equixity.app/equixity.js"
  data-merchant-id="YOUR_PUBLIC_ID">
</script>
```

It reads `data-merchant-id` from its own script tag. If missing, it logs a clear
error and does **not** attach `window.Equixity`. When present it exposes
`window.Equixity.complete({ transactionSignature })`, which validates its input
shape only — the purchase-verification backend is a separate build.

### Dashboard

Sidebar: Overview / Rewards / Funding / Account.

- **Overview** — merchant name, USDC balance, selected asset, reward rate,
  total rewards issued (an aggregate over `reward_events`, not a counter), and
  a correctly-shaped empty rewards activity table.
- **Rewards** — asset selector (SPYx/AAPLx/NVDAx), reward % input (0.01–20%,
  enforced client-side for UX and by Zod + the DB check constraint), an
  enable/disable toggle, save, and the SDK snippet with a copy button.
- **Funding** — balance, your personal deposit address with copy, a
  "Check for new deposits" button, a self-service Withdraw form, and the
  funding + withdrawal history.
- **Account** — email, business name, merchant ID, deposit address, sign out.

A new merchant can sign up, land in the dashboard with a deposit address
already generated, pick an asset, set a rate within bounds, save it, send USDC
to their own deposit address from any wallet, see their balance update after a
refresh, copy their SDK snippet, and see an empty, correctly-shaped rewards
activity table.

## Security notes

- Server-side auth resolution on every route; no client-supplied merchant ID.
- RLS enabled on every merchant-scoped table.
- No secret ever behind a `NEXT_PUBLIC_` prefix.
- All amounts are integer base units, never floats.
- Per-merchant deposit private keys are AES-256-GCM encrypted at rest
  (`DEPOSIT_KEY_ENCRYPTION_SECRET`) and never returned by any API.
- Balance credit + funding insert are atomic (`credit_funding`); the withdrawal
  reserve debit and fail-refund are atomic too (`reserve_withdrawal` /
  `fail_withdrawal`).
- The only signing that happens is the merchant's own keypair building an
  outbound USDC withdrawal (for funds they already hold). The deposit key is
  decrypted in server memory for one signing call and never returned by any
  API; the fee payer holds no authority over merchant balances.