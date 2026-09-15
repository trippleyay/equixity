# Equixity — Merchant MVP

A loyalty platform where businesses reward customers with real tokenized stocks
(SPYx, AAPLx, NVDAx) instead of points or cash. This repo is the **merchant side**:
account, reward configuration, funding (a personal deposit address), the SDK
snippet, and the activity view.

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
| `NEXT_PUBLIC_APP_URL` | your app origin | SDK snippet base; defaults to `https://equixity.app` |

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

`GET /api/merchant/funding` looks up the merchant's deposit address, computes its
USDC associated token account, fetches confirmed signatures (wallet **and** ATA —
inbound USDC transfers list the ATA, not the wallet, in `account_keys`), parses
each new signature, and for each confirmed net USDC credit calls the atomic
`credit_funding()` plpgsql function (insert + balance increment in one call).
It only costs RPC calls when someone opens the Funding page — no cron, no
webhook.

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
  enforced client-side for UX and by Zod + the DB check constraint), save, and
  the SDK snippet with a copy button.
- **Funding** — balance, your personal deposit address with copy, a
  "Check for new deposits" button, and the funding history.
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
- Balance credit + funding insert are atomic (`credit_funding`).
- No signing ever happens in this build.