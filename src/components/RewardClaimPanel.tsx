"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  usePrivy,
  useLogin,
  useIdentityToken,
} from "@privy-io/react-auth";
import { useCreateWallet } from "@privy-io/react-auth/solana";

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
  | ({
      kind: "delivered";
      recipient: string | null;
      claimMethod: string | null;
    } & Display)
  | { kind: "claiming"; reason: string | null }
  | { kind: "failed"; reason: string | null }
  | { kind: "error" };

/**
 * WHAT THIS MESSAGE MAY AND MAY NOT SAY.
 *
 * The previous wording ended "Nothing was charged against the reward balance",
 * which was flatly wrong. Observed live: a request that timed out at the 60
 * second ceiling had already swapped the reward AND delivered it to the
 * customer's wallet, while the page told them nothing had happened. Claiming a
 * specific financial outcome from a failed fetch is a guess, and a guess a
 * customer will act on.
 *
 * So it says only what is known: we could not confirm the result. The reward
 * page itself is the place that resolves it, because it reads status from the
 * server rather than from this one request.
 */
const RETRY_MESSAGE =
  "We could not confirm the result just now. Reload this page to see where your " +
  "reward stands - it may already be in your wallet.";

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
  onDelivered,
}: {
  rewardEventId: string;
  /** Exact approved attestation sentence, server-derived. */
  attestationText: string;
  /** Lets the page switch its heading when delivery completes. */
  onDelivered?: () => void;
}) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  // Creating the embedded wallet is OURS to trigger, not something we hope the
  // login modal did. Observed live: a signed-in customer got the server's
  // "No wallet is linked to this account yet." (422) and the flow stopped, which
  // defeats the entire point of the "Use Equixity" button. The provider is
  // `embeddedWallets.solana.createOnLogin: "users-without-wallets"`, which only
  // covers a brand new login; an account that already existed, or one where the
  // wallet was never provisioned, ends up signed in with no address. So when the
  // server reports that, we create one and resolve again.
  const { createWallet } = useCreateWallet();
  // Privy writes the IDENTITY token to its store only on some app
  // configurations, and asking for one costs a rate-limited API call (see
  // resolveWallet below). Read it if it is already there, never chase it.
  const { identityToken } = useIdentityToken();

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

  // Privy's token getters are reached through refs so `resolveWallet` below
  // keeps a STABLE identity. That stability matters: the mount effect depends on
  // it, and a callback that changes identity on every render would make that
  // effect re-run on every render, which is a retry storm against a
  // rate-limited API.
  const getAccessTokenRef = useRef(getAccessToken);
  const identityTokenRef = useRef(identityToken);
  // Same treatment for createWallet, so `resolveWallet` keeps a STABLE identity
  // and the mount effect cannot turn into a retry storm.
  const createWalletRef = useRef(createWallet);
  useEffect(() => {
    getAccessTokenRef.current = getAccessToken;
    identityTokenRef.current = identityToken;
    createWalletRef.current = createWallet;
  }, [getAccessToken, identityToken, createWallet]);

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
          setState({
            kind: "delivered",
            recipient: json.customerWalletAddress
              ? clean(json.customerWalletAddress)
              : null,
            claimMethod: json.claimMethod ? String(json.claimMethod) : null,
            ...display,
          });
        else if (json.status === "claiming")
          setState({ kind: "claiming", reason: json.reason ?? null });
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

  useEffect(() => {
    if (state.kind === "delivered") onDelivered?.();
  }, [state.kind, onDelivered]);

  // Privy: once signed in, resolve the Solana address SERVER-SIDE. The browser
  // is never the trusted source for the address.
  //
  // WHAT ACTUALLY BROKE (two browsers, two emails, and the console said so):
  //
  //   GET auth.privy.io/api/v1/users/me 429 (Too Many Requests)
  //
  // That request is not a sign-in call, and it is not the identity token being
  // read: it is the installed SDK's own fetch, and it can be traced exactly. In
  // @privy-io/react-auth 3.44 the exported `getIdentityToken()` runs
  // `updateUserAndIdToken()`, which is literally
  // `this.api.get("/api/v1/users/me")`; `useUser().refreshUser()` calls that
  // same method. Nothing else in the browser bundle asks for that route, so the
  // only thing being rate limited was our own polling of `getIdentityToken()`,
  // on a page a customer had just paid on.
  //
  // THE FIX IS TO STOP ASKING PRIVY FOR A SECOND TOKEN. The ACCESS token is
  // already in the browser the moment a session exists, it is the exact token
  // our server verifies, and `getAccessToken()` reads it locally instead of
  // calling Privy. Our server then reads the wallet from Privy itself, once,
  // with the app secret, and caches it for a minute. The identity token is still
  // sent when the store happens to hold one, because the server prefers it (it
  // verifies that token in-process against the app's JWKS, so it costs no Privy
  // API call at all), but nothing depends on it any more.
  //
  // READING IS NOT THE SAME AS ASKING: `useIdentityToken()` is a plain store
  // selector in this SDK version, not a fetch. `useUser().refreshUser()` and
  // the imperative `getIdentityToken()` are the two calls that cost a request,
  // and this page uses neither.
  //
  // SINGLE-FLIGHT: one resolve in flight at a time, so clicking twice cannot
  // stack requests.
  const resolvingRef = useRef(false);
  const resolveWallet = useCallback(async (): Promise<string | null> => {
    // Already resolved: hand the address straight back so the caller can carry
    // on. Never a second request for something already known.
    if (privyResolved) return privyResolved;
    if (resolvingRef.current) return null;
    resolvingRef.current = true;
    setWalletError(null);

    /**
     * A few short reads of the local access token, covering the beat between
     * "login finished" and "Privy has written the token into its store". This
     * never throws on a missing token (it returns null), so the loop treats a
     * throw exactly like a null and keeps going. Six tries at most, because this
     * is a local read, not a network call with a rate limit behind it.
     */
    const freshAccessToken = async (): Promise<string | null> => {
      for (let attempt = 0; attempt < 6; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, Math.min(300 * attempt, 1200)));
        }
        try {
          const token = await getAccessTokenRef.current();
          if (token) return token;
        } catch {
          // Treated as "not ready yet".
        }
      }
      return null;
    };

    const post = async (accessToken: string | null, idToken: string | null) => {
      const res = await fetch("/api/public/privy-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, idToken }),
      });
      const json = await res.json().catch(() => ({}));
      return {
        ok: res.ok,
        status: res.status,
        address: typeof json?.address === "string" ? json.address : null,
        error: typeof json?.error === "string" ? json.error : null,
      };
    };

    try {
      let result = await post(
        await freshAccessToken(),
        identityTokenRef.current ?? null,
      );

      // AT MOST one retry, and only for a status that heals on its own:
      //
      //   * 401 / 422 - a brand new session can be a beat behind, and a freshly
      //     created account can be a beat ahead of its embedded wallet;
      //   * 503 - our server could not reach Privy this once. A customer who has
      //     already paid must not lose the reward to a moment of Privy being
      //     busy, and ONE retry two seconds later is not the polling that caused
      //     this page's original 429.
      //
      // Two attempts in total, never a loop. Anything after that is reported to
      // the customer as it is, in the server's own words.
      const retryable =
        result.status === 401 || result.status === 422 || result.status === 503;
      if (!result.ok && retryable) {
        await new Promise((r) =>
          setTimeout(r, result.status === 503 ? 2_000 : 900),
        );
        result = await post(
          await freshAccessToken(),
          identityTokenRef.current ?? null,
        );
      }

      // A signed-in customer with no wallet is the ONE status we can fix here,
      // so we fix it rather than reporting it: create the embedded wallet, then
      // resolve again exactly once. This is what makes "Use Equixity" work for
      // someone who has never used crypto and has no wallet at all, which is the
      // entire target user.
      if (!result.ok && result.status === 422) {
        try {
          await createWalletRef.current();
        } catch (e) {
          console.warn("Embedded wallet creation failed:", (e as Error).message);
        }
        result = await post(
          await freshAccessToken(),
          identityTokenRef.current ?? null,
        );
      }

      if (result.address) {
        setPrivyResolved(result.address);
        setWalletError(null);
        return result.address;
      }

      if (!result.ok && result.error) {
        // The server's own words, with any en/em dash stripped.
        setWalletError(clean(result.error));
        return null;
      }

      setWalletError("We could not verify your sign-in. Please try again.");
      return null;
    } catch {
      setWalletError("We could not verify your sign-in. Please try again.");
      return null;
    } finally {
      resolvingRef.current = false;
    }
  }, [privyResolved]);

  // NOTHING RESOLVES A WALLET ON ITS OWN. A restored Privy session means the
  // customer is signed in; it does NOT mean they chose to receive this reward in
  // an Equixity wallet. Whose wallet gets the money is a question this page
  // asks, never one it answers from a cookie. The address is resolved when the
  // customer presses "Use Equixity" (see signIn) and at no other time.

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
  /**
   * DELIVERY. The one place a reward ever moves.
   *
   * Called from exactly two controls, both of which are a customer pressing
   * something: "Use Equixity" (once Privy has handed back an address) and
   * "Confirm and Claim Reward" (once a pasted address has validated). It is NOT
   * called from an effect any more. It used to be, and because Privy persists
   * sessions a returning customer arrived already resolved, so ticking the
   * attestation box swapped and sent their reward with no click on anything,
   * while the visible button sat greyed out underneath. A customer's money is
   * not a side effect of a checkbox.
   *
   * SYNCHRONOUS IN-FLIGHT GUARD: `submitting` disables the button, but React
   * applies that a render later, so two clicks in the same tick could otherwise
   * both fire. The ref closes that window.
   */
  const submittingRef = useRef(false);
  const deliver = useCallback(
    (walletAddress: string | null, claimMethod: string | null) => {
      if (state.kind !== "ready" || submittingRef.current) return;

      const display = {
        amountUsd: state.amountUsd,
        assetName: state.assetName,
      };

      submittingRef.current = true;
      setSubmitting(true);
      setWalletError(null);
      setResult(null);

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
          if (json.status === "delivered") {
            setState({
              kind: "delivered",
              recipient: walletAddress,
              claimMethod,
              ...display,
            });
            return;
          }
          if (json.status === "claiming") {
            setState({ kind: "claiming", reason: json.reason ?? null });
            return;
          }
          if (json.status === "blocked") {
            setState({ kind: "blocked", ...display });
            return;
          }
          if (json.status === "failed") {
            setState({ kind: "failed", reason: json.reason ?? null });
            return;
          }
          setResult({
            message: clean(json.reason ?? json.error ?? RETRY_MESSAGE),
          });
        })
        .catch(() => setResult({ message: RETRY_MESSAGE }))
        .finally(() => {
          submittingRef.current = false;
          setSubmitting(false);
        });
    },
    [state, attested, rewardEventId],
  );

  /**
   * One press of "Use Equixity", start to finish.
   *
   * Resolve the address SERVER-SIDE (the browser is never the trusted source
   * for where money goes), then deliver. If the address cannot be resolved, the
   * reason is already on screen and nothing is submitted.
   */
  const resolveAndDeliver = useCallback(async () => {
    if (state.kind !== "ready") return;
    if (!attested) {
      setWalletError("Please tick the confirmation box first.");
      return;
    }
    setSigningIn(true);
    const address = await resolveWallet();
    setSigningIn(false);
    if (!address) return;
    deliver(address, "privy_embedded");
  }, [state.kind, attested, resolveWallet, deliver]);

  /**
   * `useLogin().login()` accepts callbacks, and `onComplete` is the one that
   * matters here. The previous code called `openLogin()` and then relied on a
   * 4-second timer to clear the busy label, with no completion handler at all.
   * That is why a real sign-in went nowhere: the modal opened, the customer
   * signed in, Privy created the wallet, and we never asked for the token
   * afterwards. `onComplete` (plus `onError`, so a failure is visible) closes
   * that loop.
   */
  /**
   * `useLogin(callbacks)` is where the completion handlers live; `login()` itself
   * only takes modal options. The JSDoc on the installed types is explicit:
   * "callbacks.onComplete ... callback to execute for already- or newly-
   * authenticated users" and "callbacks.onError ... if there is an error during
   * login".
   *
   * Passing them to `openLogin()` does not typecheck, and the previous version
   * passed NO handler at all: the modal opened, the customer signed in, Privy
   * created the wallet, and nothing afterwards asked for the token. That is the
   * second half of why the button appeared dead.
   */
  const { login: openLogin } = useLogin({
    onComplete: () => {
      setSigningIn(false);
      // The session exists now, so the press on "Use Equixity" is carried
      // through: resolve the address, then deliver. The press WAS the choice.
      void resolveAndDeliver();
    },
    onError: () => {
      setSigningIn(false);
      setWalletError("We could not sign you in just now. Please try again.");
    },
  });

  /**
   * "USE EQUIXITY" IS THE CHOICE, AND THE PRESS IS THE CONSENT.
   *
   * One press, and the customer is done: sign in (or use the session already on
   * this browser), resolve the address server-side, deliver, and land on the
   * dashboard where the stock is visible. No second button, no wallet address
   * shown to someone who has never used crypto, and no explanation of what a
   * token account is. That is the whole point of this path for the audience it
   * exists for.
   *
   * The reward page used to stop one step earlier, at a card reading "Your
   * Equixity wallet is ready. The reward will go here: <address>" with a second
   * confirm button under it. That address means nothing to the person it was
   * printed for, and the extra button made the page look like a two-step form.
   *
   * `authenticated` is checked FIRST because Privy persists sessions: a
   * returning customer is already signed in, and `login()` would refuse to
   * reopen the modal.
   */
  const signIn = useCallback(() => {
    setWalletError(null);
    setResult(null);

    if (!ready) {
      setWalletError("Still getting things ready. Tap again in a moment.");
      return;
    }

    if (authenticated) {
      void resolveAndDeliver();
      return;
    }

    setSigningIn(true);
    openLogin();
    // Safety: never leave the label stuck on "Opening..." if the modal is
    // dismissed without firing either callback above.
    setTimeout(() => setSigningIn(false), 8000);
  }, [ready, authenticated, openLogin, resolveAndDeliver]);

  /**
   * THE PASTED-ADDRESS PATH, AND THE CRYPTO PATH.
   *
   * Both are one press of "Confirm and Claim Reward". Nothing here starts on
   * its own: this is called from a button and from nowhere else.
   */
  const confirm = useCallback(() => {
    if (state.kind !== "ready") return;
    if (!attested) {
      setWalletError("Please tick the confirmation box first.");
      return;
    }

    if (!state.needsWallet) {
      // Crypto: the destination is already fixed to the wallet that paid, so
      // there is nothing for the customer to choose or to type.
      deliver(null, "same_wallet");
      return;
    }

    const pasted = walletInput.trim();
    const problem = walletValidationError(pasted);
    if (problem) {
      setWalletError(problem);
      return;
    }
    deliver(pasted, "pasted_address");
  }, [state, attested, walletInput, walletValidationError, deliver]);

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
    const deliveredAmount = amount ? `${amount} of ${asset}` : "Your reward";
    return (
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-equixity-mist/50 p-6 text-center shadow-soft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/purple-giftbox.svg"
          alt=""
          width={88}
          height={92}
          className="mx-auto h-20 w-auto"
        />
        <h2 className="mt-3 font-display text-2xl font-medium text-ink">
          Your reward has been delivered
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-ink/80">
          {deliveredAmount} has been sent to your wallet
          {state.recipient ? (
            <>
              {" "}
              <span className="font-mono break-all">{state.recipient}</span>
            </>
          ) : null}
          .
        </p>
        {state.claimMethod === "privy_embedded" ? (
          <a
            href="/wallet"
            className="mt-5 inline-block rounded-full bg-equixity-deep px-5 py-2.5 text-sm font-medium text-white transition hover:bg-equixity-deepDark"
          >
            View your rewards
          </a>
        ) : null}
      </div>
    );
  }

  /**
   * STILL IN FLIGHT, AND SAID SO HONESTLY.
   *
   * The server has already broadcast a transaction it could not confirm inside
   * its own time budget. That is not a failure and must not be dressed as one:
   * the chain resolves it, reconciliation settles the row, and the asset is
   * usually already there. The old page reported this exact situation as "did
   * not go through" while the customer's wallet held the stock.
   */
  if (state.kind === "claiming") {
    return (
      <div className="rounded-2xl border border-ink/5 bg-white p-6 shadow-soft">
        <p className="font-display text-lg font-medium text-ink">
          Your reward is on its way.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate">
          {state.reason
            ? clean(state.reason)
            : "This settles on its own within a minute. Nothing else is needed from you."}
        </p>
        <a
          href="/wallet"
          className="mt-4 inline-block rounded-full border border-equixity-deep px-5 py-2.5 text-sm font-medium text-equixity-deep transition hover:bg-equixity-mist"
        >
          Check your rewards
        </a>
      </div>
    );
  }

  if (state.kind === "failed") {
    return (
      <div className="rounded-2xl border border-ink/5 bg-white p-6 shadow-soft">
        <p className="text-sm text-ink">
          This reward could not be delivered
          {state.reason ? ` (${clean(state.reason)})` : ""}.{" "}
          <a href="/contact" className="font-medium text-equixity underline">
            Reach out
          </a>{" "}
          and we will look at it.
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
        ONE PRIMARY ACTION, AND THE ADDRESS FIELD HIDDEN BEHIND A LINK.

          1. nothing chosen yet - "Use Equixity" is the only visible action.
             That single press carries the whole flow: sign in, resolve the
             address, deliver, land on the customer dashboard. It replaced a
             step that printed a wallet address at someone who has never used
             crypto and then asked them to confirm it, which was asking them to
             approve something they had no way to judge.

          2. "I already have a wallet" - reveals the paste field, and only then
             does a confirm button exist. Typing an address IS the choice.

        Nothing is delivered without a press on one of those two controls.
      */}
      {state.needsWallet ? (
        <div className="mt-5">
          {showPaste ? (
            /*
              The customer's own wallet, pasted. Nothing here touches Privy, and
              delivery waits for the button under the field.
            */
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
                {submitting ? "Delivering…" : "Confirm and Claim Reward"}
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
          ) : (
            /*
              NOTHING CHOSEN YET: both destinations are offered and nothing is
              claimed. The context line exists because a bare "Use Equixity"
              button is a mystery to someone who has never used crypto; it says
              what the button does and that no existing account is needed.
            */
            <div>
              <p className="mb-3 text-sm text-slate">
                Create an Equixity wallet with your email, or sign in to the one
                you already have.
              </p>
              <button
                type="button"
                onClick={signIn}
                disabled={!attested || signingIn}
                className="w-full rounded-full bg-equixity px-4 py-3 text-sm font-semibold text-white transition hover:bg-equixity-deepDark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {signingIn ? "Opening…" : "Use Equixity"}
              </button>
              <button
                type="button"
                onClick={() => setShowPaste(true)}
                className="mt-3 w-full text-center text-sm text-slate underline underline-offset-4 transition hover:text-ink"
              >
                I already have a wallet
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
