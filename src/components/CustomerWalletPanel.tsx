"use client";

import { useCallback, useEffect, useRef, useState } from "react";
// Privy exposes Solana wallets and Solana signing from a dedicated entry point.
// The root entry point's `useSignTransaction` is the EVM one (it takes an
// `UnsignedTransactionRequest` and returns a 0x signature), which is why the
// Solana import path matters here.
import { useWallets, useSignTransaction } from "@privy-io/react-auth/solana";
import { usePrivy, useLogin, useLogout, useIdentityToken } from "@privy-io/react-auth";
import { getAccessToken } from "@privy-io/react-auth";

/**
 * Customer wallet panel: sign in, see what you hold, send it out.
 *
 * IDENTITY IS PRIVY AND ONLY PRIVY. There is no Equixity customer account. A
 * returning customer signs in with the SAME email and gets the SAME Privy user,
 * which means the SAME embedded Solana wallet, so a second reward from any
 * merchant lands alongside the first instead of creating a second wallet. That
 * is the whole account model: the email is the identity, Privy owns it, and we
 * never store it ourselves.
 *
 * THE SIGNATURE HAPPENS HERE, IN THE BROWSER, THROUGH PRIVY. The server builds
 * a transaction and signs only the network fee; the token authority signature
 * has to come from the customer's own wallet, and the only party that can produce
 * it is Privy on the customer's machine. We never hold a customer key, so we
 * could not send their tokens even if we wanted to.
 */

type Holding = {
  rewardEventId: string;
  ticker: string;
  displayName: string;
  logoUrl: string | null;
  amount: string | null;
  amountUsd: string | null;
  merchantName: string | null;
  deliveredAt: string;
  balanceReadable: boolean;
};

function usdLabel(raw: string | null): string | null {
  if (!raw) return null;
  // reward_usdc_units is a USDC base-unit string (6 decimals). Integer math only.
  const units = BigInt(raw);
  const cents = units / 10_000n;
  const whole = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, "0");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${grouped}.${frac}`;
}

export function CustomerWalletPanel() {
  const { ready, authenticated } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  // Privy holds the identity token only on some app configurations. It is read,
  // never requested: requesting one makes a browser-side call to a rate-limited
  // Privy endpoint, which is exactly what broke sign-in on the claim page
  // (`GET auth.privy.io/api/v1/users/me 429`).
  const { identityToken } = useIdentityToken();

  const [address, setAddress] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [openReward, setOpenReward] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Held in a ref so `tokens` (and therefore `load`) keeps a stable identity and
  // the load effect cannot re-run on every render.
  const identityTokenRef = useRef<string | null>(null);
  useEffect(() => {
    identityTokenRef.current = identityToken;
  }, [identityToken]);

  /**
   * The tokens the server needs, fetched fresh so an expired access token is
   * refreshed.
   *
   * The ACCESS token is the one that matters: the server verifies it and then
   * reads the wallet from Privy itself. The identity token rides along when
   * Privy's store happens to hold one, because the server prefers it (it costs
   * no API call there), but nothing depends on it.
   */
  const tokens = useCallback(async () => {
    const accessToken = await getAccessToken();
    return { accessToken, idToken: identityTokenRef.current };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await tokens();
      const res = await fetch("/api/customer/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(t),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "We could not load your rewards.");
        setHoldings([]);
        return;
      }
      setAddress(json.address ?? null);
      setHoldings(Array.isArray(json.holdings) ? json.holdings : []);
    } catch {
      setError("We could not load your rewards. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [tokens]);

  // The data fetch is the effect's job; resetting local state when the user
  // signs out is handled in the render branches below, so no state is written
  // synchronously in the effect body.
  useEffect(() => {
    if (!ready || !authenticated) return;
    let cancelled = false;
    void (async () => {
      const result = await load();
      if (cancelled) return;
      void result;
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, load]);

  const send = useCallback(
    async (holding: Holding) => {
      setBusy(true);
      setFormError(null);
      setNotice(null);
      try {
        const t = await tokens();

        // Leg 1: the server validates, records the transfer, and returns a
        // transaction it has signed only as fee payer.
        const build = await fetch("/api/customer/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...t,
            rewardEventId: holding.rewardEventId,
            amount: amount.trim(),
            destination: destination.trim(),
          }),
        });
        const built = await build.json().catch(() => ({}));
        if (!build.ok) {
          setFormError(built.error ?? "We could not start that transfer.");
          return;
        }

        // Privy co-signs as the owner, in the customer's browser. This is the
        // only party that can produce that signature; the server never could.
        const wallet = wallets.find((w) => w.address === address) ?? wallets[0];
        if (!wallet) {
          setFormError("Your wallet is still loading. Please try again in a moment.");
          return;
        }

        const signed = await signTransaction({
          transaction: base64ToBytes(built.serializedTransaction),
          wallet,
        });

        // Leg 2: broadcast and settle.
        const submit = await fetch("/api/customer/transfer/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...t,
            transferId: built.transferId,
            signedTransaction: bytesToBase64(signed.signedTransaction),
          }),
        });
        const done = await submit.json().catch(() => ({}));
        if (!submit.ok) {
          setFormError(done.error ?? "The transfer did not go through.");
          return;
        }

        setNotice(`Sent. Your ${holding.ticker} is on its way.`);
        setOpenReward(null);
        setAmount("");
        setDestination("");
        void load();
      } catch {
        setFormError("Something went wrong. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [amount, destination, load, signTransaction, tokens, wallets, address],
  );

  // Everything the customer holds, in one number. Integer math only: the server
  // sends USDC base units as strings, so the sum never touches a float.
  const totalUnits = holdings.reduce<bigint>(
    (sum, h) => (h.amountUsd ? sum + BigInt(h.amountUsd) : sum),
    0n,
  );
  const totalLabel = usdLabel(totalUnits.toString()) ?? "$0.00";
  const rewardCountLabel =
    holdings.length === 1 ? "1 reward" : `${holdings.length} rewards`;

  if (!ready) {
    return (
      <div className="rounded-2xl border border-ink/5 bg-white p-6 text-sm text-slate shadow-soft">
        Loading your wallet...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="rounded-2xl border border-white/60 bg-gradient-to-b from-white via-white to-equixity-mist/80 p-6 shadow-lift sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-equixity-deep">
          Sign in
        </p>
        <p className="mt-2 font-display text-2xl font-medium text-ink">
          See your rewards
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate">
          Use the same email you used when you claimed. You will get the same
          wallet every time, with everything you have earned in one place.
        </p>
        <button
          type="button"
          onClick={() => login()}
          className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-equixity-deep px-6 py-3 text-sm font-medium text-white transition hover:bg-equixity-deepDark sm:w-auto"
        >
          Continue with email
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* The one number that matters, in the brand gradient, exactly as the
          merchant dashboard presents a balance. A customer opening this on a
          phone should see what they own before they see any chrome. */}
      <div className="rounded-2xl bg-gradient-to-br from-equixity-deep via-equixity to-equixity-deepDark p-6 shadow-lift">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
              Total value
            </p>
            <p className="mt-2 font-display text-3xl font-medium text-white">
              {loading && holdings.length === 0 ? "..." : totalLabel}
            </p>
            <p className="mt-1 text-xs text-white/70">{rewardCountLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="shrink-0 rounded-full border border-white/40 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/10"
          >
            Sign out
          </button>
        </div>

        <div className="mt-5 border-t border-white/15 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
            Your wallet
          </p>
          <p className="mt-1 truncate font-mono text-xs text-white/90">
            {address ?? "Resolving..."}
          </p>
        </div>
      </div>

      {loading && holdings.length === 0 && (
        <div className="rounded-2xl border border-ink/5 bg-white p-6 text-sm text-slate shadow-soft">
          Loading what you hold...
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 shadow-soft">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900 shadow-soft">
          {notice}
        </div>
      )}

      {!loading && !error && holdings.length === 0 && (
        <div className="rounded-2xl border border-ink/5 bg-white p-8 text-center shadow-soft">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-equixity-mist">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              className="h-6 w-6 text-equixity-deep"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 11.25v8.25a1.5 1.5 0 0 1-1.5 1.5H4.5a1.5 1.5 0 0 1-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 1 0 9.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1 1 14.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
              />
            </svg>
          </div>
          <p className="mt-4 font-display text-lg font-medium text-ink">
            You don&apos;t have any rewards yet.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate">
            They appear here the moment a merchant sends you one.
          </p>
        </div>
      )}

      {holdings.length > 0 && (
        <p className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
          What you hold
        </p>
      )}

      {holdings.map((h) => {
        const isOpen = openReward === h.rewardEventId;
        return (
          <div
            key={h.rewardEventId}
            className="rounded-2xl border border-ink/5 bg-white p-5 shadow-soft transition-shadow hover:shadow-lift"
          >
            <div className="flex items-center gap-4">
              {h.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={h.logoUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-full bg-equixity-mist object-cover ring-1 ring-ink/5"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-equixity-mist text-sm font-semibold text-equixity-deep ring-1 ring-ink/5">
                  {h.ticker.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-medium text-ink">
                  {h.displayName}
                </p>
                <p className="truncate text-xs text-slate">
                  {h.ticker}
                  {h.merchantName ? ` from ${h.merchantName}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-lg font-medium text-ink">
                  {h.amount ?? "0"}
                </p>
                {h.amountUsd && (
                  <p className="text-xs text-slate">{usdLabel(h.amountUsd)}</p>
                )}
              </div>
            </div>

            {!h.balanceReadable && (
              <p className="mt-3 text-xs text-slate">
                We could not read this balance just now.
              </p>
            )}

            <div className="mt-4 border-t border-ink/5 pt-4">
              {isOpen ? (
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-slate">
                    Amount of {h.ticker} to send
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="mt-1 w-full rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-equixity-deep focus:ring-2 focus:ring-equixity-deep/25"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate">
                    Recipient wallet address
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="Paste the recipient's wallet address."
                      className="mt-1 w-full rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-equixity-deep focus:ring-2 focus:ring-equixity-deep/25"
                    />
                  </label>
                  {formError && <p className="text-xs text-red-700">{formError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenReward(null);
                        setFormError(null);
                      }}
                      className="rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-slate transition hover:bg-equixity-mist"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void send(h)}
                      className="rounded-full bg-equixity-deep px-5 py-2 text-xs font-medium text-white transition hover:bg-equixity-deepDark disabled:opacity-60"
                    >
                      {busy ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOpenReward(h.rewardEventId);
                    setFormError(null);
                  }}
                  className="rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-ink transition hover:bg-equixity-mist"
                >
                  Send it out
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

