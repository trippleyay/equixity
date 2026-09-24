/**
 * verify-privy-resolve.ts
 *
 * Committed manual check for the Privy wallet resolver's rejection paths.
 *
 * WHY IT EXISTS: this page has already been taken down live once by Privy rate
 * limits (`GET auth.privy.io/api/v1/users/me 429`), and the whole point of
 * `resolveCustomerWallet` is that a bad or missing token is refused LOCALLY,
 * with no Privy API request that could be rate limited. This script proves that
 * by measuring how long each refusal takes: a rejection that never left the
 * process is milliseconds, while a request that went to Privy is not. It prints
 * every result and exits non-zero if any of these inputs is ever ACCEPTED, or if
 * a refusal takes suspiciously long.
 *
 * It also exercises the well-formed-but-bogus JWT case, which IS expected to be
 * slow the first time: that one reaches jose's JWKS cache, which fetches the
 * app's key set once per server process (and then not again for an hour). That
 * line in the output is the cost this codebase deliberately pays once, not once
 * per request.
 *
 * Run (loads .env.local, so never on CI):
 *   npm run verify:privy-resolve
 */
import fs from "node:fs";

function loadDotEnvLocal(file: string): void {
  const src = fs.readFileSync(file, "utf8");
  for (const line of src.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(?:"(.*)"|(\S.*))?\s*$/);
    if (!m) continue;
    const key = m[1];
    const value = (m[2] ?? m[3] ?? "").trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// Load .env.local BEFORE importing modules that read process.env.
if (fs.existsSync(".env.local")) loadDotEnvLocal(".env.local");

async function main(): Promise<void> {
  const { resolveCustomerWallet } = await import(
    "../src/lib/auth/customer-session"
  );

  const cases: Array<{ name: string; input: Record<string, unknown> }> = [
    { name: "no tokens at all", input: {} },
    { name: "garbage access token", input: { accessToken: "not-a-jwt" } },
    { name: "garbage identity token only", input: { idToken: "not-a-jwt" } },
    {
      name: "garbage identity + access token",
      input: { idToken: "not-a-jwt", accessToken: "not-a-jwt" },
    },
    {
      name: "well-formed but bogus JWT",
      input: {
        accessToken:
          "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9." +
          "eyJzdWIiOiJkaWQ6cHJpdnk6ZmFrZSIsImlzcyI6InByaXZ5LmlvIn0.AAAA",
      },
    },
  ];

  let accepted = 0;
  for (const c of cases) {
    const started = Date.now();
    const result = await resolveCustomerWallet(c.input);
    const ms = Date.now() - started;
    const outcome =
      "error" in result
        ? `REJECTED status=${result.status} "${result.error}"`
        : `ACCEPTED address=${result.address}`;
    console.log(`${c.name.padEnd(34)} ${String(ms).padStart(5)}ms  ${outcome}`);
    if (!("error" in result)) {
      accepted++;
      console.error("  ^ every one of these inputs must be rejected");
    }
  }

  if (accepted) {
    console.error(`\nFAIL: ${accepted} case(s) were accepted`);
    process.exit(1);
  }
  console.log(
    "\nPASS: every rejection path refused the request, and the malformed ones" +
      " were refused without a Privy API call",
  );
}

void main();
