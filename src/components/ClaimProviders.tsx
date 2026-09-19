"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { PrivyProvider } from "@privy-io/react-auth";
import { clusterApiUrl } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";


/**
 * Client providers for the PUBLIC CLAIM PAGE only (spec section 5).
 *
 * This is the one place in the app where a standard "Connect Wallet" flow is the
 * right call — the whole point is obtaining a wallet address to send funds to,
 * which is exactly what wallet-adapter exists for. The merchant dashboard
 * deliberately does NOT use it.
 *
 * Scoped to the claim route so the wallet/Privy bundle never loads for merchants
 * or for the marketing page.
 *
 * DELIBERATELY NOT using the umbrella `@solana/wallet-adapter-wallets` package:
 * it pulls in the whole Metamask SDK + WalletConnect tree for chains this app
 * never touches. Only the two wallets a Solana customer realistically uses are
 * included, which keeps the claim page's bundle honest.
 *
 * Privy config, verified against Privy's current docs:
 *   config.embeddedWallets.solana.createOnLogin = 'users-without-wallets'
 * ('all-users' | 'users-without-wallets' | 'off'; the default is 'off', which
 * would leave a new user with NO Solana address to receive a reward).
 */
export function ClaimProviders({ children }: { children: React.ReactNode }) {
  // Public RPC for the client-side connection provider. The server side uses the
  // configured Alchemy endpoint; the browser only needs this for wallet-adapter's
  // baseline wiring, never for an authoritative read.
  const endpoint = useMemo(() => clusterApiUrl("mainnet-beta"), []);
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

  const withWallets = (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );

  // If Privy is not configured, still render the wallet-connect path rather than
  // breaking the page entirely — the email/Google option simply will not appear.
  if (!privyAppId) return withWallets;

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      {withWallets}
    </PrivyProvider>
  );
}