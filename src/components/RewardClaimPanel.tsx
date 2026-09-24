"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  usePrivy,
  useLogin,
  getIdentityToken,
} from "@privy-io/react-auth";

/**
 * The hosted reward flow (reward-delivery spec sections 3a, 4).
 *
 * Runs as ordinary React on /reward/[rewardEventId] under Equixity's own
 * domain. Geo is checked fresh on load and AGAIN on confirm; the attestation
 * is the single checkbox plus the legal line; fiat customers either paste a
 * wallet address (validated like the withdrawal destination) or use Privy to
 * set one up. Crypto customers never enter anything — the reward goes to the
 * wallet that paid.
 *
 * All copy is fixed wording; interpolated values pass through `clean` so no
 * en/em dash can ever appear in what the customer reads.
 */

// The attestation sentence itself is BUILT SERVER-SIDE (restricted-countries.ts
// `rewardAttestationText`) and passed in as a prop, so the jurisdiction list the
// customer reads is literally the list the geo gate enforces. Nothing about the
// legal wording lives in this client component.
function clean(value: string | null | undefined): string {
  return String(value ?? "").replace(/[\u2013\u2014]/g, "-");
}

type Display = { amountUsd: string | null; assetName: string | null };

type StatusState =
  | { kind: "loading" }
  | ({ kind: "blocked" } & Display)
  | ({
      kind: "ready";
      needsWallet: boolean;
    } & Display)
  | ({ kind: "delivered" } & Display)
  | { kind: "failed"; reason: string | null }
  | { kind: "error" };

const RETRY_MESSAGE =
  "Something went wrong on our end and this didn't go through. " +
  "Nothing was charged against the reward balance - try refreshing in a minute.";

/**
 * "Apple Inc." -> "Apple Inc. stock", mirroring the notification badge, so both
 * surfaces name the reward the same way. Already-suffixed names are left alone.
 */
function assetLabelOf(name: string | null | undefined): string {
  const cleaned = clean(name);
  if (!cleaned) return "stock";
  return /stock/i.test(cleaned) ? cleaned : `${cleaned} stock`;
}

/** "$2.40" when the backend reported an amount, null when it did not. */
function amountLabelOf(amountUsd: string | null | undefined): string | null {
  const cleaned = clean(amountUsd);
  return cleaned ? `$${cleaned}` : null;
}

export function RewardClaimPanel({
  rewardEventId,
  attestationText,
}: {
  rewardEventId: string;
  /** Exact approved attestation sentence, server-derived. */
  attestationText: string;
}) {
  const { ready, authenticated } = usePrivy();
  const { login: openLogin } = useLogin();

  const [state, setState] = useState<StatusState>({ kind: "loading" });
  const [attested, setAttested] = useState(false);
  const [walletInput, setWalletInput] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [privyResolved, setPrivyResolved] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [result, setResult] = useState<{ message: string } | null>(null);
  // Identifies THIS page load for the two-strike geo rule: a refresh makes a
  // fresh id, so only distinct loads can advance the streak. Generated inside
  // the load effect (never during render, which must stay pure) and read back
  // by the confirm call.
  const viewIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const viewId = (
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now()) + "-" + Math.random().toString(36).slice(2)
    ).slice(0, 64);
    viewIdRef.current = viewId;
    const params = new URLSearchParams({
      rewardEventId,
      view: viewId,
    });
    fetch(`/api/public/reward-status?${params.toString()}`)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((json) => {
        if (cancelled) return;
        // Amount and asset travel with every state so the approved copy can
        // name them; null just means the backend did not report one.
        const display = {
          amountUsd: json.amountUsd ? clean(json.amountUsd) : null,
          assetName: json.assetName ? clean(json.assetName) : null,
        };
        if (json.status === "blocked") setState({ kind: "blocked", ...display });
        else if (json.status === "delivered")
          setState({ kind: "delivered", ...display });
        else if (json.status === "failed")
          setState({ kind: "failed", reason: json.reason ?? null });
        else if (json.status === "ready")
          setState({
            kind: "ready",
            ...display,
            needsWallet: Boolean(json.needsWallet),
          });
        else setState({ kind: "error" });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [rewardEventId]);

  // Privy: once signed in, resolve the Solana address SERVER-SIDE from the
  // identity token. The browser is never the trusted source for the address.
  //
  // `getIdentityToken()` (imperative) rather than the `useIdentityToken` hook:
  // the hook is populated during render and does not re-fire reliably when a
  // session is RESTORED after mount, which is exactly the returning-customer
  // case. Calling it imperatively on demand always returns a fresh token.
  //
  // SINGLE-FLIGHT + ONE BACKED-OFF RETRY, both deliberate, and both added after
  // this failed live in two browsers with two different emails. The console
  // showed `GET auth.privy.io/api/v1/users/me 429 (Too Many Requests)`. That
  // is PRIVY rate-limiting its own users/me endpoint, not a sign-in failure and
  // not a problem with our route. The previous code let that transient 429
  // surface to the customer as "We could not confirm your sign-in", which is
  // both wrong and alarming on a checkout they just paid for.
  //
  // So: one call in flight at a time (re-entrancy guard), and one short retry
  // after a brief pause if Privy answers 429. A real failure after that still
  // reports honestly.
  const resolvingRef = useRef(false);
  const resolveWallet = useCallback(async () => {
    if (resolvingRef.current || privyResolved) return;
    resolvingRef.current = true;
    setWalletError(null);

    const fetchIdentityToken = async (): Promise<string | null> => {
      // getIdentityToken() has no response object, so a rate limit surfaces as a
      // rejection. Retry once after a pause rather than failing the customer.
      try {
        return await getIdentityToken();
      } catch {
        await new Promise((r) => setTimeout(r, 1200));
        try {
          return await getIdentityToken();
        } catch {
          return null;
        }
      }
    };

    try {
      const idToken = await fetchIdentityToken();
      if (!idToken) {
        setWalletError(
          "We could not confirm your sign-in just now. Please try once more.",
        );
        return;
      }
      const res = await fetch("/api/public/privy-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) throw new Error("verify failed");
      const json = await res.json();
      if (json?.address) {
        setPrivyResolved(json.address);
        setWalletError(null);
      } else {
        setWalletError("We could not verify your sign-in. Please try again.");
      }
    } catch {
      setWalletError("We could not verify your sign-in. Please try again.");
    } finally {
      resolvingRef.current = false;
    }
  }, [privyResolved]);

  // If Privy already has a restored session, resolve the wallet on mount so a
  // returning customer never has to press anything. The call is deferred to a
  // task so the effect body performs no synchronous setState of its own.
  useEffect(() => {
    if (!ready || !authenticated || privyResolved) return;
    const timer = setTimeout(() => void resolveWallet(), 0);
    return () => clearTimeout(timer);
  }, [ready, authenticated, privyResolved, resolveWallet]);

  const walletValidationError = useCallback(
    (value: string): string | null => {
      const trimmed = value.trim();
      if (!trimmed) return "Enter your wallet address to receive the reward.";
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
        return "That does not look like a Solana wallet address. Paste the full address.";
      }
      return null;
    },
    [],
  );

  /**
   * Three cases, and every one of them now gives the customer SOMETHING:
   *
   * 1. Privy still initialising: wait for it and retry, instead of returning
   *    silently (the previous `if (!ready) return` made the button look dead
   *    whenever Privy was slow, with no console output and no UI change).
   * 2. Already signed in: Privy PERSISTS sessions, so `login()` refuses to
   *    re-open the modal and only logs "Attempted to log in, but user is
   *    already logged in" to the console. Observed live. Resolve the wallet
   *    from the existing session and let delivery continue.
   * 3. Genuinely signed out: open the Privy modal, which creates the embedded
   *    Solana wallet on completion.
   */
  const signIn = useCallback(() => {
    setWalletError(null);

    if (!ready) {
      setWalletError("Still getting things ready. Tap again in a moment.");
      return;
    }

    if (authenticated) {
      setSigningIn(true);
      void resolveWallet().finally(() => setSigningIn(false));
      return;
    }

    setSigningIn(true);
    openLogin();
    // Safety: clear the busy label even if the modal is dismissed without a
    // completion event, so the button can never stay stuck on "Opening...".
    setTimeout(() => setSigningIn(false), 4000);
  }, [ready, authenticated, openLogin, resolveWallet]);

  const confirm = useCallback(() => {
    if (state.kind !== "ready") return;

    const display = { amountUsd: state.amountUsd, assetName: state.assetName };

    let walletAddress: string | null = null;
    let claimMethod: string | null = null;
    if (state.needsWallet) {
      if (privyResolved) {
        walletAddress = privyResolved;
        claimMethod = "privy_embedded";
      } else {
        const problem = walletValidationError(walletInput);
        if (problem) {
          setWalletError(problem);
          return;
        }
        walletAddress = walletInput.trim();
        claimMethod = "pasted_address";
      }
    }
    if (!attested) {
      setWalletError("Please tick the confirmation box first.");
      return;
    }

    setSubmitting(true);
    setWalletError(null);
    fetch("/api/public/reward-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rewardEventId,
        walletAddress: walletAddress ?? undefined,
        claimMethod: claimMethod ?? undefined,
        attestationAccepted: attested,
        view: viewIdRef.current,
      }),
    })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (r.ok && json.status === "delivered") {
          setState({ kind: "delivered", ...display });
          return;
        }
        if (r.status === 403 && json.status === "blocked") {
          setState({ kind: "blocked", ...display });
          return;
        }
        // A transient delivery failure is retryable; nothing was lost.
        setResult({
          message: clean(json.reason ?? json.error ?? RETRY_MESSAGE),
        });
      })
      .catch(() => setResult({ message: RETRY_MESSAGE }))
      .finally(() => setSubmitting(false));
  }, [state, attested, walletInput, privyResolved, walletValidationError, rewardEventId]);

  /**
   * The Privy path has no second button by design: "Use Equixity" is the only
   * visible action, and a customer who has never used crypto should not have to
   * make a second choice after signing in. So once Privy has returned a verified
   * wallet AND the attestation is ticked, delivery fires on its own.
   *
   * The ref guard makes this fire exactly once per page load even though the
   * effect re-runs on each dependency change.
   */
  const autoConfirmedRef = useRef(false);
  useEffect(() => {
    if (state.kind !== "ready" || !state.needsWallet) return;
    if (!privyResolved || !attested) return;
    if (autoConfirmedRef.current) return;
    autoConfirmedRef.current = true;
    confirm();
  }, [state, attested, privyResolved, confirm]);

  if (state.kind === "loading") {
    return (
      <div className="rounded-2xl border border-ink/5 bg-white p-6 text-sm text-slate shadow-soft">
        Checking your reward…
      </div>
    );
  }

  if (state.kind === "blocked") {
    const amount = amountLabelOf(state.amountUsd);
    const asset = assetLabelOf(state.assetName);
    return (
      <div className="rounded-2xl border border-ink/5 bg-white p-6 shadow-soft">
        <p className="text-[0.95rem] leading-relaxed text-ink">
          {amount
            ? `You earned ${amount} of ${asset} for this purchase, but`
            : "You earned a reward for this purchase, but"}{" "}
          we can&apos;t deliver stock rewards to your region right now. If you
          think this is a mistake,{" "}
          <a
            href="/contact"
            className="font-medium text-equixity underline underline-offset-2 hover:opacity-80"
          >
            reach out
          </a>
          .
        </p>
      </div>
    );
  }

  if (state.kind === "delivered") {
    const amount = amountLabelOf(state.amountUsd);
    const asset = assetLabelOf(state.assetName);
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-soft">
        <p className="font-display text-lg font-medium text-ink">
          {amount ? `Done. ${amount} of ${asset} is yours.` : "Done. Your reward is yours."}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink/80">
          It is in your wallet now. Sign in any time to see what you hold or send
          it somewhere else.
        </p>
        <a
          href="/wallet"
          className="mt-4 inline-block rounded-full bg-equixity-deep px-5 py-2.5 text-sm font-medium text-white transition hover:bg-equixity-deepDark"
        >
          View your rewards
        </a>
      </div>
    );
  }

  if (state.kind === "failed") {
    return (
      <div className="rounded-2xl border border-ink/5 bg-white p-6 shadow-soft">
        <p className="text-sm text-ink">
          This reward could not be delivered
          {state.reason ? ` (${clean(state.reason)})` : ""}. Nothing was charged
          against the reward balance.{" "}
          <a href="/contact" className="font-medium text-equixity underline">
            Reach out
          </a>{" "}
          if this keeps happening.
        </p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="rounded-2xl border border-ink/5 bg-white p-6 shadow-soft">
        <p className="text-sm text-ink">{RETRY_MESSAGE}</p>
      </div>
    );
  }

  // ---- ready ----------------------------------------------------------------
  const amountLabel = amountLabelOf(state.amountUsd);
  const assetLabel = assetLabelOf(state.assetName);
  const earned = amountLabel ? `${amountLabel} of ${assetLabel}` : "a reward";

  return (
    <div className="rounded-2xl border border-ink/5 bg-white p-6 shadow-soft">
      <p className="font-display text-xl font-medium text-ink">
        {state.needsWallet
          ? `You earned ${earned} for this order. Choose how you'd like to receive it.`
          : `You earned ${earned} for this order. It's going to the wallet you paid with. Confirm below and it's yours.`}
      </p>

      <label className="mt-5 flex items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300"
        />
        <span>
          I confirm I&apos;m not located in a restricted region.
          <span className="mt-1 block text-xs text-slate">
            {attestationText}
          </span>
        </span>
      </label>

      {/*
        ONE primary action, deliberately. Two equally weighted buttons made a
        non-crypto customer stop and choose between two things they did not
        understand. "Use Equixity" is the path almost everyone takes, so it is
        the only button on screen. Bringing your own wallet is a link that
        reveals the field, for the small number who need it.
      */}
      {state.needsWallet ? (
        <div className="mt-5">
          {/*
            Context line, because a bare "Use Equixity" button is a mystery to
            someone who has never used crypto. It states plainly what the button
            will do and that no existing account is required.
          */}
          <p className="mb-3 text-sm text-slate">
            Create an Equixity wallet with your email, or sign in to the one you
            already have.
          </p>
          <button
            type="button"
            onClick={signIn}
            disabled={!attested || submitting || signingIn}
            className="w-full rounded-full bg-equixity px-4 py-3 text-sm font-semibold text-white transition hover:bg-equixity-deepDark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {signingIn ? "Opening…" : "Use Equixity"}
          </button>

          {!showPaste ? (
            <button
              type="button"
              onClick={() => setShowPaste(true)}
              className="mt-3 w-full text-center text-sm text-slate underline underline-offset-4 transition hover:text-ink"
            >
              I already have a wallet
            </button>
          ) : (
            <div className="mt-4">
              <label
                htmlFor="eqx-wallet"
                className="block text-xs font-medium text-slate"
              >
                Paste your wallet address
              </label>
              <input
                id="eqx-wallet"
                type="text"
                value={walletInput}
                onChange={(e) => {
                  setWalletInput(e.target.value);
                  setWalletError(null);
                }}
                placeholder="Paste your Solana wallet address"
                autoComplete="off"
                spellCheck={false}
                disabled={submitting}
                className="mt-1 w-full rounded-full border border-ink/10 bg-white px-4 py-2.5 font-mono text-sm text-ink outline-none focus:border-equixity"
              />
              <button
                type="button"
                onClick={confirm}
                disabled={submitting || !attested || !walletInput.trim()}
                className="mt-3 w-full rounded-full bg-equixity px-4 py-3 text-sm font-semibold text-white transition hover:bg-equixity-deepDark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Delivering…" : "Confirm & Claim Reward"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPaste(false);
                  setWalletInput("");
                  setWalletError(null);
                }}
                className="mt-2 w-full text-center text-xs text-slate underline underline-offset-4 transition hover:text-ink"
              >
                Use Equixity instead
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={confirm}
          disabled={submitting || !attested}
          className="mt-5 w-full rounded-full bg-equixity px-4 py-3 text-sm font-semibold text-white transition hover:bg-equixity-deepDark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Delivering…" : "Confirm & Claim Reward"}
        </button>
      )}

      {walletError && <p className="mt-3 text-sm text-red-600">{walletError}</p>}
      {result && <p className="mt-3 text-sm text-ink">{result.message}</p>}
    </div>
  );
}
