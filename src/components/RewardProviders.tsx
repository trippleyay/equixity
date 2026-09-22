"use client";

import { useMemo } from "react";
import { PrivyProvider } from "@privy-io/react-auth";

/**
 * Client providers for the HOSTED reward page (reward-delivery spec 3a).
 *
 * This page is the one place a customer resolves a destination wallet, and it
 * runs entirely under Equixity's own domain as ordinary React — no embedding
 * constraints, no Shadow DOM. Privy is the "Set one up for me" path: an
 * embedded Solana wallet created from just an email, with the address
 * resolved SERVER-SIDE via /api/public/privy-wallet so the browser is never
 * the trusted source for where money goes.
 *
 * Wallet-connect is deliberately absent: the fiat "I already have a wallet"
 * path is a pasted wallet address validated like the withdrawal destination,
 * and the crypto path needs no wallet entry at all ('same_wallet'). That is
 * the whole mechanism list — nothing else.
 *
 * Privy config, verified against Privy's current docs:
 *   config.embeddedWallets.solana.createOnLogin = 'users-without-wallets'
 * ('all-users' | 'users-without-wallets' | 'off'; the default is 'off', which
 * would leave a new user with NO Solana address to receive a reward).
 */
export function RewardProviders({ children }: { children: React.ReactNode }) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

  // If Privy is not configured, still render the page rather than breaking it
  // entirely — the "Set one up for me" option simply will not be offered.
  if (!privyAppId) return <>{children}</>;

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
