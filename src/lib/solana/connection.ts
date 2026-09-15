import { Connection } from "@solana/web3.js";
import { env } from "@/lib/env";

/**
 * Lazily-created connection to the Alchemy Solana RPC endpoint (mainnet-beta).
 * SERVER-ONLY — the RPC URL is a server-side secret and must not carry a
 * NEXT_PUBLIC_ prefix.
 *
 * @solana/web3.js v1 line (npm `latest` 1.99.x), which the spec assumes:
 * `Connection`, `getSignaturesForAddress`, `getParsedTransaction`, `Keypair`,
 * `PublicKey`. (v2 of web3.js is a differently-shaped API that this build does
 * not target.)
 */
let connection: Connection | null = null;

export function getSolanaConnection(): Connection {
  if (connection) return connection;
  if (!env.alchemyRpcUrl) {
    throw new Error(
      "ALCHEMY_SOLANA_RPC_URL is not set; funding detection requires a " +
        "mainnet-beta RPC endpoint (Alchemy).",
    );
  }
  connection = new Connection(env.alchemyRpcUrl, "confirmed");
  return connection;
}

export function hasAlchemyRpcConfigured(): boolean {
  return env.alchemyRpcUrl.length > 0;
}