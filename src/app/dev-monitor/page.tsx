import { getServiceClient } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import { hasFeePayerConfigured, getFeePayerKeypair } from "@/lib/solana/fee-payer";
import { getSolanaConnection, hasAlchemyRpcConfigured } from "@/lib/solana/connection";

export const dynamic = "force-dynamic";

/**
 * /dev-monitor — internal ops dashboard. NOT merchant-facing, NOT themed.
 * Gated by the same CRON_SECRET the sync workflow uses (bearer header or
 * ?key= query param). Returns 404 without a valid key so it does not even
 * advertise its existence.
 */

type Row = Record<string, unknown>;

async function count(service: ReturnType<typeof getServiceClient>, table: string, col: string, val: string) {
  const { count } = await service.from(table).select("id", { count: "exact", head: true }).eq(col, val);
  return count ?? 0;
}

export default async function DevMonitor({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const provided =
    (typeof params.key === "string" && params.key) ||
    undefined;
  // Header check happens in middleware-free style here: this page is a server
  // component, so the key must come via query param (curl users can pass
  // ?key=...). Invalid/absent -> render a bare 404-ish page.
  if (!env.cronSecret || provided !== env.cronSecret) {
    return (
      <html>
        <body style={{ fontFamily: "monospace" }}>
          <p>Not found.</p>
        </body>
      </html>
    );
  }

  const service = getServiceClient();

  const [
    merchants,
    stuckClaims,
    failedClaims,
    stuckWithdrawals,
    failedWithdrawals,
    pendingEvents,
    unpricedAssets,
  ] = await Promise.all([
    (async () => {
      const { count } = await service.from("merchants").select("id", { count: "exact", head: true });
      return count ?? 0;
    })(),
    count(service, "reward_claims", "status", "claiming"),
    count(service, "reward_claims", "status", "failed"),
    count(service, "withdrawal_transactions", "status", "submitted"),
    count(service, "withdrawal_transactions", "status", "failed"),
    count(service, "reward_events", "status", "pending"),
    (async () => {
      const { count } = await service
        .from("reward_assets")
        .select("ticker", { count: "exact", head: true })
        .eq("is_active", true)
        .is("current_price_usd", null);
      return count ?? 0;
    })(),
  ]);

  // Fee payer + RPC health (best-effort, ops-only info).
  let feePayerSol: number | null = null;
  let rpc = "not configured";
  if (hasFeePayerConfigured() && hasAlchemyRpcConfigured()) {
    try {
      const conn = getSolanaConnection();
      const lamports = await conn.getBalance(getFeePayerKeypair().publicKey);
      feePayerSol = lamports / 1_000_000_000;
      rpc = "ok";
    } catch (e) {
      rpc = `error: ${e instanceof Error ? e.message : "unknown"}`;
    }
  }

  const rows: Array<[string, string | number, string?]> = [
    ["merchants", merchants],
    ["reward_events pending", pendingEvents],
    ["claims stuck 'claiming' >0s", stuckClaims],
    ["claims failed", failedClaims],
    ["withdrawals 'submitted' (in flight)", stuckWithdrawals],
    ["withdrawals failed", failedWithdrawals],
    ["active assets with NO price", unpricedAssets, unpricedAssets > 0 ? "sync may be degraded" : undefined],
    ["fee payer SOL", feePayerSol === null ? "n/a" : feePayerSol.toFixed(4), feePayerSol !== null && feePayerSol < 0.05 ? "LOW" : undefined],
    ["solana rpc", rpc],
  ];

  return (
    <div style={{ fontFamily: "monospace", padding: 24, fontSize: 14 }}>
      <h1 style={{ fontSize: 16 }}>dev monitor</h1>
      <p style={{ color: "#888" }}>internal — do not share this URL</p>
      <table cellPadding={6} style={{ borderCollapse: "collapse", marginTop: 12 }}>
        <tbody>
          {rows.map(([k, v, note]) => (
            <tr key={k} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ color: "#555" }}>{k}</td>
              <td style={{ fontWeight: 700 }}>{v}</td>
              <td style={{ color: note ? "#b45309" : "#aaa" }}>{note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 16, color: "#888" }}>
        Checks: claims stuck in &apos;claiming&apos; need reconciliation (Funding page
        view resolves them). &apos;submitted&apos; withdrawals resolve via chain status.
        Unpriced active assets mean the upstream sync is degraded.
      </p>
    </div>
  );
}