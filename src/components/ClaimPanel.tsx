"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { usePrivy } from "@privy-io/react-auth";

/**
 * The interactive part of the claim page (spec sections 5 and 6a).
 *
 * TWO CLAIM PATHS, both ending in the same thing (a customer wallet address):
 *   * connect an existing Solana wallet via wallet-adapter;
 *   * sign in with email/Google via Privy for an embedded wallet, where the
 *     address is resolved SERVER-SIDE from the verified Privy user record — the
 *     browser is never trusted as the source of the destination address.
 *
 * SECTION 6a IS VISIBLE HERE: the attestation checkbox and the country check both
 * gate the Claim button, and it cannot submit without them. The authoritative
 * enforcement is still server-side; this is the UI half, not the control.
 */

const ATTESTATION_TEXT =
  "I confirm I am not a U.S. person and I am not located in a restricted jurisdiction.";

type ClaimResult = {
  status: string;
  transactionSignature?: string | null;
  reason?: string | null;
  error?: string;
};

export function ClaimPanel({
  rewardEventId,
  initialStatus,
}: {
  rewardEventId: string;
  initialStatus: string;
}) {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const privy = usePrivy() as unknown as {
    ready?: boolean;
    authenticated?: boolean;
    login?: () => void;
    getAccessToken?: () => Promise<string | null>;
    getIdToken?: () => Promise<string | null>;
  };

  const [attested, setAttested] = useState(false);
  const [privyAddress, setPrivyAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Record the detected country on page LOAD. This deliberately does NOT gate
  // status or mark anything ineligible: `ineligible` is terminal, so letting a
  // page view set it would let a stray VPN blip permanently kill the claim. The
  // real gate runs on submit with a fresh re-check (spec section 6a).
  useEffect(() => {
    void fetch("/api/public/claim-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rewardEventId }),
    }).catch(() => {
      // Non-fatal by design: recording is best-effort, the gate is not.
    });
  }, [rewardEventId]);

  const walletAddress = publicKey?.toBase58() ?? privyAddress;

  // Resolve the Privy embedded Solana address server-side once signed in.
  const resolvePrivyWallet = useCallback(async () => {
    if (!privy?.authenticated) return;
    try {
      const accessToken = (await privy.getAccessToken?.()) ?? null;
      const idToken = (await privy.getIdToken?.()) ?? null;
      if (!accessToken && !idToken) return;
      const res = await fetch("/api/public/privy-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, idToken }),
      });
      const json = (await res.json()) as { address?: string; error?: string };
      if (res.ok && json.address) {
        setPrivyAddress(json.address);
      } else {
        setError(json.error ?? "Could not read your embedded wallet address.");
      }
    } catch {
      setError("Could not read your embedded wallet address.");
    }
  }, [privy]);

  useEffect(() => {
    void resolvePrivyWallet();
  }, [resolvePrivyWallet]);

  const alreadyDone = initialStatus !== "unclaimed";
  const canClaim = !alreadyDone && attested && Boolean(walletAddress) && !busy;

  async function submit() {
    if (!walletAddress) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/public/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rewardEventId,
          customerWalletAddress: walletAddress,
          claimMethod: privyAddress ? "privy_embedded" : "wallet_connect",
          attestationAccepted: attested,
        }),
      });
      const json = (await res.json()) as ClaimResult;
      if (!res.ok) {
        // An `ineligible` rejection is a compliance block, not a technical
        // failure — surfaced with its own wording (spec section 6a).
        if (json.status === "ineligible") {
          setResult({ status: "ineligible", reason: json.reason });
        } else {
          setError(json.error ?? json.reason ?? "The claim could not be completed.");
        }
        return;
      }
      setResult(json);
    } catch {
      setError(
        "Network error while submitting the claim. Nothing was lost — you can retry.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (alreadyDone) {
    return (
      <div className="rounded-2xl border border-ink/5 bg-equixity-mist/50 p-4 text-sm text-ink">
        This reward is already marked <strong>{initialStatus}</strong>. Nothing further
        is needed.
      </div>
    );
  }

  if (result?.status === "delivered") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-medium">Your reward has been sent.</p>
        {result.transactionSignature ? (
          <p className="mt-1 break-all text-xs">
            Transaction:{" "}
            <a
              className="underline"
              href={`https://solscan.io/tx/${result.transactionSignature}`}
              target="_blank"
              rel="noreferrer"
            >
              {result.transactionSignature}
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  if (result?.status === "ineligible") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">This reward cannot be issued.</p>
        <p className="mt-1">{result.reason}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* --- 1. Destination wallet, by either path --------------------------- */}
      <div className="rounded-2xl border border-ink/5 bg-white p-4 shadow-soft">
        <p className="text-sm font-semibold text-ink">1. Choose where to receive it</p>

        {walletAddress ? (
          <p className="mt-2 break-all font-mono text-xs text-gray-700">
            {walletAddress}
            {privyAddress ? (
              <span className="ml-2 font-sans text-gray-500">(embedded wallet)</span>
            ) : null}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setVisible(true)}
              className="rounded-full bg-equixity-deep px-4 py-2 text-sm font-medium text-white transition hover:bg-equixity-deepDark"
            >
              Connect a Solana wallet
            </button>
            {privy?.ready && privy.login ? (
              <button
                type="button"
                onClick={() => privy.login?.()}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-ink transition hover:bg-equixity-mist"
              >
                Sign in with email or Google
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* --- 2. Section 6a attestation --------------------------------------- */}
      <div className="rounded-2xl border border-ink/5 bg-white p-4 shadow-soft">
        <p className="text-sm font-semibold text-ink">2. Confirm eligibility</p>
        <label className="mt-2 flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
            className="mt-0.5"
          />
          <span>{ATTESTATION_TEXT}</span>
        </label>
        <p className="mt-2 text-xs text-gray-500">
          Rewards are restricted for persons in the United States, United Kingdom,
          Canada, Australia, and OFAC-sanctioned jurisdictions. Your location is checked
          when you claim.
        </p>
      </div>

      {/* --- 3. Submit ------------------------------------------------------- */}
      <button
        type="button"
        onClick={submit}
        disabled={!canClaim}
        className={
          canClaim
            ? "w-full rounded-full bg-equixity-deep px-4 py-2.5 text-sm font-medium text-white transition hover:bg-equixity-deepDark"
            : "w-full cursor-not-allowed rounded-full bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-500"
        }
      >
        {busy ? "Claiming…" : "Claim reward"}
      </button>

      {!attested || !walletAddress ? (
        <p className="text-xs text-gray-500">
          {walletAddress
            ? "Tick the confirmation above to enable the claim."
            : "Choose a wallet to enable the claim."}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {result?.status === "claiming" ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {result.reason ??
            "Your reward is still confirming. Refresh in a moment — nothing was lost."}
        </p>
      ) : null}

      {result?.status === "failed" ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {result.reason ?? "The claim could not be completed."}
        </p>
      ) : null}
    </div>
  );
}