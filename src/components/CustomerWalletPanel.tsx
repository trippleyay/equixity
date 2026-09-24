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

  if (!ready) {
    return (
      <div className="rounded-2xl border border-ink/5 bg-white p-6 text-sm text-slate shadow-soft">
        Loading your wallet…
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="rounded-2xl border border-ink/5 bg-white p-7 shadow-soft">
        <p className="font-display text-xl font-medium text-ink">
          Sign in to see your rewards
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate">
          Use the same email you used when you claimed. You will get the same
          wallet every time, with everything you have earned in one place.
        </p>
        <button
          type="button"
          onClick={() => login()}
          className="mt-5 rounded-full bg-equixity-deep px-6 py-3 text-sm font-medium text-white transition hover:bg-equixity-deepDark"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-ink/5 bg-white px-5 py-4 shadow-soft">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
            Your wallet
          </p>
          <p className="mt-1 truncate font-mono text-xs text-ink">
            {address ?? "Resolving…"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="shrink-0 rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-slate transition hover:bg-ink/5"
        >
          Sign out
        </button>
      </div>

      {loading && holdings.length === 0 && (
        <div className="rounded-2xl border border-ink/5 bg-white p-6 text-sm text-slate shadow-soft">
          Loading what you hold…
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          {notice}
        </div>
      )}

      {!loading && !error && holdings.length === 0 && (
        <div className="rounded-2xl border border-ink/5 bg-white p-6 text-sm leading-relaxed text-slate shadow-soft">
          You don&apos;t have any rewards yet. They appear here the moment a
          merchant sends you one.
        </div>
      )}

      {holdings.map((h) => {
        const isOpen = openReward === h.rewardEventId;
        return (
          <div
            key={h.rewardEventId}
            className="rounded-2xl border border-ink/5 bg-white p-5 shadow-soft"
          >
            <div className="flex items-center gap-4">
              {h.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={h.logoUrl}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="h-11 w-11 shrink-0 rounded-full bg-equixity-mist" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-medium text-ink">
                  {h.displayName}
                </p>
                <p className="text-xs text-slate">
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

            <div className="mt-4">
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
                      className="mt-1 w-full rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-equixity focus:ring-2 focus:ring-equixity/20"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate">
                    Recipient wallet address
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="Paste the recipient's wallet address."
                      className="mt-1 w-full rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-equixity focus:ring-2 focus:ring-equixity/20"
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
                      className="rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-slate transition hover:bg-ink/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void send(h)}
                      className="rounded-full bg-equixity-deep px-5 py-2 text-xs font-medium text-white transition hover:bg-equixity-deepDark disabled:opacity-60"
                    >
                      {busy ? "Sending…" : "Send"}
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
                  className="rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-ink transition hover:bg-ink/5"
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

