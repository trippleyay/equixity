import { run, makeEl, check, summary, API, MERCHANT } from "./harness.mjs";

const SIG = "5J8kDeadBeefSignatureValue";
const tag = (extra = {}) =>
  makeEl("script", {
    src: API + "/equixity.js",
    "data-merchant-id": MERCHANT,
    ...extra,
  });

const okJson = (obj) => ({ ok: true, status: 200, json: async () => obj });
const errJson = (obj, status) => ({ ok: false, status, json: async () => obj });
const VERIFY = API + "/api/public/complete";
const EXISTS = API + "/api/public/reward-exists";
const NO_CALLS = { fetchImpl: async () => { throw new Error("must not be called"); } };

// --- 1. Stripe success page: session_id in the address ----------------------
{
  console.log("\n[1] Stripe redirect: polls by the session id");
  const { badgeText, badgeLinks, errors, fetchCalls } = await run({
    url: "https://shop.test/thanks?session_id=cs_test_abc123",
    tags: [tag()],
    fetchImpl: async (u) => {
      if (u === EXISTS + "?merchantId=" + MERCHANT + "&externalOrderId=cs_test_abc123") {
        return okJson({ exists: true, rewardEventId: "fiat-1", amountUsd: "5.00", assetName: "Tesla" });
      }
      throw new Error("unexpected url " + u);
    },
  });
  check("polled the existence endpoint once", fetchCalls.length === 1 && fetchCalls[0].url === EXISTS + "?merchantId=" + MERCHANT + "&externalOrderId=cs_test_abc123", JSON.stringify(fetchCalls.map((c) => c.url)));
  check("never called the crypto verification", !fetchCalls.some((c) => c.url === VERIFY));
  check("badge shows the amount and links the hosted page", badgeText.includes("5.00") && badgeLinks.includes(API + "/reward/fiat-1"), badgeText);
  check("no console errors", errors.length === 0, errors.join("; "));
}

// --- 2. Flutterwave success page: tx_ref in the address ---------------------
{
  console.log("\n[2] Flutterwave redirect: polls by tx_ref");
  const { fetchCalls, badgeText, errors } = await run({
    url: "https://shop.test/thanks?status=successful&tx_ref=order_7841&transaction_id=42",
    tags: [tag()],
    fetchImpl: async (u) => {
      if (u.includes("externalOrderId=order_7841")) {
        return okJson({ exists: true, rewardEventId: "flw-1", amountUsd: "2.40", assetName: "Apple" });
      }
      throw new Error("unexpected url " + u);
    },
  });
  check("polled by tx_ref", fetchCalls.length === 1 && fetchCalls[0].url.includes("externalOrderId=order_7841"), JSON.stringify(fetchCalls.map((c) => c.url)));
  check("transaction_id was not used as the reference", !fetchCalls.some((c) => c.url.includes("42")), JSON.stringify(fetchCalls.map((c) => c.url)));
  check("badge rendered", badgeText.includes("2.40"), badgeText);
  check("no console errors", errors.length === 0, errors.join("; "));
}

// --- 3. Own backend success page: order_id in the address --------------------
{
  console.log("\n[3] Own backend redirect: polls by order_id");
  const { fetchCalls } = await run({
    url: "https://shop.test/thanks?order_id=order_5",
    tags: [tag()],
    fetchImpl: async () => okJson({ exists: false }),
  });
  check("polled by order_id", fetchCalls.length >= 1 && fetchCalls[0].url.includes("externalOrderId=order_5"), JSON.stringify(fetchCalls.map((c) => c.url)));
}

// --- 4. Session id under a custom parameter name ----------------------------
{
  console.log("\n[4] renamed parameter: found by its cs_ shape");
  const { fetchCalls } = await run({
    url: "https://shop.test/thanks?my_checkout_ref=cs_test_777xyz",
    tags: [tag()],
    fetchImpl: async () => okJson({ exists: false }),
  });
  check("used the cs_ value as the order id", fetchCalls.some((c) => c.url.includes("externalOrderId=cs_test_777xyz")), JSON.stringify(fetchCalls.map((c) => c.url)));
}

// --- 5. Solana (dormant): signature still verifies --------------------------
{
  console.log("\n[5] Solana redirect: verification still works");
  const { fetchCalls, badgeText } = await run({
    url: "https://shop.test/thanks?signature=" + SIG,
    tags: [tag()],
    fetchImpl: async (u) => {
      if (u === VERIFY) {
        return okJson({ rewardEventId: "abc-123", status: "pending", assetName: "Apple", rewardUsdcValue: "2.40" });
      }
      throw new Error("unexpected url " + u);
    },
  });
  check("called the verification endpoint once", fetchCalls.length === 1 && fetchCalls[0].url === VERIFY, JSON.stringify(fetchCalls.map((c) => c.url)));
  const sent = JSON.parse(fetchCalls[0].opts.body);
  check("sent ONLY merchant + signature", Object.keys(sent).length === 2 && sent.merchantId === MERCHANT && sent.transactionSignature === SIG, JSON.stringify(sent));
  check("no amount was sent from the page", sent.purchaseAmount === undefined && sent.amountUsd === undefined);
  check("badge shows the backend amount", badgeText.includes("2.40"), badgeText);
}

// --- 6. Cancelled payment: quiet, nothing happens ---------------------------
{
  console.log("\n[6] Flutterwave cancelled redirect: completely quiet");
  const { badgeText, errors, fetchCalls } = await run({
    url: "https://shop.test/thanks?status=cancelled&tx_ref=order_7841",
    tags: [tag()],
    ...NO_CALLS,
  });
  check("no requests made", fetchCalls.length === 0, String(fetchCalls.length));
  check("no badge", badgeText === "", badgeText);
  check("no console noise", errors.length === 0, errors.join("; "));
}

// --- 7. status=successful still proceeds ------------------------------------
{
  console.log("\n[7] explicit successful status: proceeds normally");
  const { fetchCalls } = await run({
    url: "https://shop.test/thanks?status=successful&tx_ref=order_1",
    tags: [tag()],
    fetchImpl: async () => okJson({ exists: false }),
  });
  check("poll happened", fetchCalls.length >= 1 && fetchCalls[0].url.includes("externalOrderId=order_1"), JSON.stringify(fetchCalls.map((c) => c.url)));
}

// --- 8. Address with BOTH kinds: refused ------------------------------------
{
  console.log("\n[8] card reference AND solana signature: refused");
  const { badgeText, errors, fetchCalls } = await run({
    url: "https://shop.test/thanks?tx_ref=order_1&signature=" + SIG,
    tags: [tag()],
    ...NO_CALLS,
  });
  check("no requests made", fetchCalls.length === 0, String(fetchCalls.length));
  check("no badge", badgeText === "", badgeText);
  check("explained in the console", errors.join(" ").includes("exactly one kind"), errors.join(" "));
}

// --- 9. Address with NEITHER: refused ---------------------------------------
{
  console.log("\n[9] plain thank-you page: refused with instructions");
  const { badgeText, errors, fetchCalls } = await run({
    url: "https://shop.test/thanks",
    tags: [tag()],
    ...NO_CALLS,
  });
  check("no requests made", fetchCalls.length === 0, String(fetchCalls.length));
  check("no badge", badgeText === "", badgeText);
  check("names a param to add", errors.join(" ").includes("session_id"), errors.join(" "));
}

// --- 10. Old tag values are ignored, not acted on ----------------------------
{
  console.log("\n[10] old data-order-id tag: ignored, fails safe");
  const { badgeText, errors, fetchCalls } = await run({
    url: "https://shop.test/thanks",
    tags: [tag({ "data-order-id": "ORDER_ID" })],
    ...NO_CALLS,
  });
  check("no requests made", fetchCalls.length === 0, String(fetchCalls.length));
  check("no badge", badgeText === "", badgeText);
  check("explained in the console", errors.join(" ").includes("does not say which purchase"), errors.join(" "));
}

// --- 11. Placeholder literal in the address ----------------------------------
{
  console.log("\n[11] literal placeholder in the address: refused");
  const { badgeText, errors, fetchCalls } = await run({
    url: "https://shop.test/thanks?order_id=ORDER_ID",
    tags: [tag()],
    ...NO_CALLS,
  });
  check("no requests made", fetchCalls.length === 0, String(fetchCalls.length));
  check("names the placeholder", errors.join(" ").includes("ORDER_ID"), errors.join(" "));
  check("no badge", badgeText === "", badgeText);
}

// --- 12. Mangled double-appended session id ----------------------------------
{
  console.log("\n[12] session_id pasted twice: refused with a specific hint");
  const { badgeText, errors, fetchCalls } = await run({
    url: "https://shop.test/thanks?session_id=cs_test_abc123?session_id=cs_test_abc123",
    tags: [tag()],
    ...NO_CALLS,
  });
  check("no requests made", fetchCalls.length === 0, String(fetchCalls.length));
  check("explains the double paste", errors.join(" ").includes("twice"), errors.join(" "));
  check("no badge", badgeText === "", badgeText);
}

// --- 13. Missing merchant id --------------------------------------------------
{
  console.log("\n[13] tag without merchant id: refused");
  const { badgeText, errors, fetchCalls } = await run({
    url: "https://shop.test/thanks?tx_ref=order_1",
    tags: [makeEl("script", { src: API + "/equixity.js" })],
    ...NO_CALLS,
  });
  check("no requests made", fetchCalls.length === 0, String(fetchCalls.length));
  check("explained in the console", errors.join(" ").includes("data-merchant-id"), errors.join(" "));
  check("no badge", badgeText === "", badgeText);
}

// --- 14. The widget invents nothing -------------------------------------------
{
  console.log("\n[14] reward id comes from the backend, never the page");
  const { badgeText, badgeLinks } = await run({
    url: "https://shop.test/thanks?signature=" + SIG,
    tags: [tag()],
    fetchImpl: async () => okJson({ rewardEventId: "server-made-this", status: "pending" }),
  });
  check("used the backend id verbatim", badgeLinks.includes(API + "/reward/server-made-this"), badgeLinks.join(","));
  check("no undefined in the link", !badgeLinks.some((l) => l.includes("undefined")), badgeLinks.join(","));
  check("no fake $0.00 amount", !badgeText.includes("$0.00"), badgeText);
  check("missing asset still reads plainly", badgeText.includes("a reward"), badgeText);
}

// --- 15. Fiat polls until the webhook lands ------------------------------------
{
  console.log("\n[15] fiat: polls until the reward is recorded");
  let polls = 0;
  const { badgeText, badgeLinks, errors, fetchCalls } = await run({
    url: "https://shop.test/thanks?session_id=cs_test_poll1",
    tags: [tag()],
    fetchImpl: async (u) => {
      polls++;
      if (polls < 3) return okJson({ exists: false });
      return okJson({ exists: true, rewardEventId: "fiat-2", amountUsd: "5.00", assetName: "Tesla" });
    },
  });
  check("never called the crypto verification", !fetchCalls.some((c) => c.url === VERIFY));
  check("polled until the reward landed", polls >= 3, String(polls));
  check("every poll used the same session id", fetchCalls.every((c) => c.url.includes("externalOrderId=cs_test_poll1")), JSON.stringify(fetchCalls.map((c) => c.url)));
  check("badge rendered once found", badgeText.includes("5.00") && badgeLinks.includes(API + "/reward/fiat-2"), badgeText);
  check("no console errors", errors.length === 0, errors.join("; "));
}

// --- 16. Crypto: already recorded -> 409 -> poll by signature -------------------
{
  console.log("\n[16] crypto page reloaded: already recorded, poll finds it");
  const urls = [];
  const { badgeText, badgeLinks, errors } = await run({
    url: "https://shop.test/thanks?signature=" + SIG,
    tags: [tag()],
    fetchImpl: async (u) => {
      urls.push(u);
      if (u === VERIFY) return errJson({ error: "dup" }, 409);
      if (u.includes("/api/public/reward-exists")) {
        return okJson({ exists: true, rewardEventId: "abc-123", amountUsd: "2.40", assetName: "Apple" });
      }
      throw new Error("unexpected url " + u);
    },
  });
  check("fell back to the existence poll", urls.some((u) => u.includes("reward-exists")), urls.join(" , "));
  check("polled by transaction signature", urls.some((u) => u.includes("transactionSignature=" + SIG)), urls.join(" , "));
  check("poll never used an order id", !urls.some((u) => u.includes("externalOrderId")), urls.join(" , "));
  check("badge rendered from the poll", badgeText.includes("2.40") && badgeLinks.includes(API + "/reward/abc-123"), badgeText);
  check("no console errors", errors.length === 0, errors.join("; "));
}

// --- 17. Crypto: not on chain yet -> bounded retries ----------------------------
{
  console.log("\n[17] crypto: a 422 is retried, then given up on");
  let calls = 0;
  const { badgeText } = await run({
    url: "https://shop.test/thanks?signature=" + SIG,
    tags: [tag()],
    fetchImpl: async () => {
      calls++;
      return errJson({ error: "not found" }, 422);
    },
  });
  check("retried exactly the bounded attempts", calls === 5, String(calls));
  check("no badge", badgeText === "", badgeText);
}

// --- 18. Crypto: rewards switched off -> no badge --------------------------------
{
  console.log("\n[18] crypto with rewards disabled: no badge");
  const { badgeText, errors } = await run({
    url: "https://shop.test/thanks?signature=" + SIG,
    tags: [tag()],
    fetchImpl: async () => okJson({ rewardEventId: "abc-123", status: "rewards_disabled" }),
  });
  check("no badge when rewards are off", badgeText === "", badgeText);
  check("no console errors", errors.length === 0, errors.join("; "));
}

console.log("\n" + summary().passed + " passed, " + summary().failed + " failed");
process.exit(summary().failed === 0 ? 0 : 1);
