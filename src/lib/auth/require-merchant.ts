import { Keypair } from "@solana/web3.js";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { encryptSecretKey } from "@/lib/crypto/deposit-keys";

/**
 * Resolves the merchant from the authenticated Supabase session, server-side.
 * Never trusts a merchant ID from the client (spec sections 5 & 8).
 *
 * On the very first authenticated request for a user, JIT-provisions the
 * merchant record + deposit account together (spec section 7: "created
 * together on first sign-in if they don't exist yet"). Provisioning runs in
 * one plpgsql function (provision_merchant) so the four rows are created
 * atomically and idempotently, even if two tabs race on first load.
 */

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in.");
    this.name = "UnauthorizedError";
  }
}

export type MerchantContext = {
  userId: string;
  merchant: { id: string; public_id: string; name: string };
};

export async function requireMerchant(): Promise<MerchantContext> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new UnauthorizedError();
  const userId = data.user.id;

  const service = getServiceClient();

  // Fast path: merchant already provisioned.
  const { data: existing } = await service
    .from("merchants")
    .select("id, public_id, name")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (existing) {
    return { userId, merchant: existing };
  }

  // First sign-in: generate the deposit keypair, encrypt the private key, and
  // provision. The encrypted private key is written to merchant_deposit_accounts
  // and is never returned by any API (spec section 8).
  const kp = Keypair.generate();
  const encrypted = encryptSecretKey(kp.secretKey);
  const name =
    (data.user.user_metadata?.business_name as string | undefined) ??
    data.user.email ??
    "Merchant";

  const { data: provisionedRaw, error: provError } = await service
    .rpc("provision_merchant", {
      p_auth_user_id: userId,
      p_name: name,
      p_deposit_address: kp.publicKey.toBase58(),
      p_encrypted_private_key: encrypted,
    })
    .single();
  const provisioned = provisionedRaw as {
    id: string;
    public_id: string;
    name: string;
  } | null;
  if (provError || !provisioned) {
    throw new Error(
      `Failed to provision merchant: ${provError?.message ?? "unknown"}`,
    );
  }

  return {
    userId,
    merchant: {
      id: provisioned.id,
      public_id: provisioned.public_id,
      name: provisioned.name,
    },
  };
}