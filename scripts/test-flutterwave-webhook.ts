/**
 * Offline checks for the Flutterwave webhook verifier (run: npm run test:flutterwave).
 * No network, no DB: pure functions in src/lib/webhooks/flutterwave.ts.
 */
import {
  verifyFlutterwaveSignature,
  parseFlutterwaveEvent,
  FLUTTERWAVE_SIGNATURE_HEADER,
} from "../src/lib/webhooks/flutterwave";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    passed++;
    console.log("  PASS  " + name);
  } else {
    failed++;
    console.log("  FAIL  " + name + (extra ? " <= " + extra : ""));
  }
}

const SECRET = "my-secret-hash-123";
const sig = (h: string | null) =>
  verifyFlutterwaveSignature({ secretHash: SECRET, receivedHeader: h });

// --- signature comparison ---------------------------------------------------
check("correct hash verifies", sig(SECRET));
check("wrong hash refused", !sig("nope"));
check("missing header refused", !sig(null));
check("empty header refused", !sig(""));
check("prefix of the secret refused", !sig(SECRET.slice(0, 8)));
check("secret with suffix appended refused", !sig(SECRET + "x"));
check("header name is verif-hash", FLUTTERWAVE_SIGNATURE_HEADER === "verif-hash");

// --- payload handling -------------------------------------------------------
const successfulCharge = JSON.stringify({
  event: "charge.completed",
  data: {
    id: 285959875,
    tx_ref: "order_7841",
    status: "successful",
    amount: 42.1,
    currency: "USD",
    customer: { email: "rose@example.com" },
  },
});

const parsed = parseFlutterwaveEvent(successfulCharge);
check("successful charge is handled", parsed.ok && parsed.result.handled);
if (parsed.ok && parsed.result.handled) {
  check("tx_ref becomes the order id", parsed.result.orderId === "order_7841");
  check("42.10 dollars -> exactly 4210 cents", parsed.result.amountCents === 4210n, String(parsed.result.amountCents));
  check("customer email extracted", parsed.result.email === "rose@example.com");
}

const wholeDollars = parseFlutterwaveEvent(
  JSON.stringify({ event: "charge.completed", data: { status: "successful", tx_ref: "r2", amount: 54600, currency: "USD" } }),
);
check("integer major unit -> cents", wholeDollars.ok && wholeDollars.result.handled && wholeDollars.result.amountCents === 5460000n);

const stringAmount = parseFlutterwaveEvent(
  JSON.stringify({ event: "charge.completed", data: { status: "successful", tx_ref: "r3", amount: "99.99", currency: "USD" } }),
);
check("string amount accepted and converted", stringAmount.ok && stringAmount.result.handled && stringAmount.result.amountCents === 9999n);

const failedCharge = parseFlutterwaveEvent(
  JSON.stringify({ event: "charge.completed", data: { status: "failed", tx_ref: "r4", amount: 10, currency: "USD" } }),
);
check("failed charge acknowledged and ignored", failedCharge.ok && !failedCharge.result.handled);

const cancelledCharge = parseFlutterwaveEvent(
  JSON.stringify({ event: "charge.completed", data: { status: "cancelled", tx_ref: "r5", amount: 10, currency: "USD" } }),
);
check("cancelled charge acknowledged and ignored", cancelledCharge.ok && !cancelledCharge.result.handled);

const transfer = parseFlutterwaveEvent(
  JSON.stringify({ event: "transfer.completed", data: { status: "successful" } }),
);
check("non-charge events ignored", transfer.ok && !transfer.result.handled);

const nonUsd = parseFlutterwaveEvent(
  JSON.stringify({ event: "charge.completed", data: { status: "successful", tx_ref: "r6", amount: 3000, currency: "NGN" } }),
);
check("non-USD charge refused, not misread", !nonUsd.ok && nonUsd.error.includes("NGN"));

const noRef = parseFlutterwaveEvent(
  JSON.stringify({ event: "charge.completed", data: { status: "successful", amount: 10, currency: "USD" } }),
);
check("missing tx_ref refused", !noRef.ok);

const badJson = parseFlutterwaveEvent("{not json");
check("invalid JSON refused", !badJson.ok);

const missingAmount = parseFlutterwaveEvent(
  JSON.stringify({ event: "charge.completed", data: { status: "successful", tx_ref: "r7", currency: "USD" } }),
);
check("missing amount refused", !missingAmount.ok);

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
