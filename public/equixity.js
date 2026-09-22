/**
 * Equixity — Merchant notification SDK (reward-delivery spec section 3).
 *
 * Served statically at /equixity.js (public dir). Loaded by pasting ONE tag into
 * the merchant's own SUCCESS PAGE, the page the customer lands on after paying.
 * That is the only supported placement: there is no checkout-page snippet, and
 * there is no function for the merchant to call.
 *
 *   Fiat:
 *   <script src="https://equixity.app/equixity.js"
 *           data-merchant-id="MERCHANT_ID"
 *           data-order-id="EXTERNAL_ORDER_ID"></script>
 *
 *   Crypto:
 *   <script src="https://equixity.app/equixity.js"
 *           data-merchant-id="MERCHANT_ID"
 *           data-transaction-signature="TRANSACTION_SIGNATURE"></script>
 *
 * Exactly one of the two attributes, never both: it says which purchase this
 * page is about. Fiat then waits for the reward to be recorded (by the Stripe
 * webhook or the merchant's own backend); crypto asks Equixity to verify the
 * payment first, because nobody else has done it yet.
 *
 * This is ALL that ever touches the merchant's page: a small, dismissible
 * badge saying a reward is waiting, linking to the hosted reward page at
 * /reward/{rewardEventId}. No checkbox, no wallet choice, no blocked message,
 * no eligibility logic of any kind lives here — the full flow runs on the
 * hosted page under Equixity's own domain (spec sections 1 and 3a).
 *
 * The SDK deliberately CALCULATES NOTHING: the amount, asset name and reward
 * id come from the Equixity endpoints, so what the customer sees can never
 * drift from what the backend verified. Nothing but the public merchant id and
 * the purchase reference is ever sent, and on the crypto path the amount is
 * read from the chain by the backend, never taken from this page. This file
 * only validates shapes, calls /api/public/complete for the crypto path, polls
 * /api/public/reward-exists (existence only) for both paths, and renders the
 * badge.
 *
 * Cross-origin by design; the endpoints accept any origin with no credentials,
 * which is safe because they carry no session or cookies.
 */
(function () {
  "use strict";

  var SCRIPT_MATCH = /\/equixity\.js(?:\?.*)?$/;
  // Bounded work per page load: after this many attempts the badge gives up
  // quietly. A payment that never lands should not hammer anything forever.
  var MAX_POLLS = 60;
  var POLL_MS = 3000;
  // Crypto only: verification may simply be a moment behind the chain, so a
  // few retries are worth it. Anything past this is a payment this page cannot
  // fix by trying again.
  var MAX_VERIFY_ATTEMPTS = 5;

  function findOwnScriptTag() {
    var candidates = document.querySelectorAll(
      "script[data-merchant-id], script[data-order-id], " +
        "script[data-transaction-signature]"
    );
    for (var i = 0; i < candidates.length; i++) {
      var src = candidates[i].getAttribute("src") || "";
      if (SCRIPT_MATCH.test(src)) return candidates[i];
    }
    return candidates.length ? candidates[0] : null;
  }

  var tag = findOwnScriptTag();
  var merchantId = tag ? tag.getAttribute("data-merchant-id") : null;
  var externalOrderId = tag ? tag.getAttribute("data-order-id") : null;
  var transactionSignature = tag
    ? tag.getAttribute("data-transaction-signature")
    : null;

  if (!merchantId || merchantId.trim() === "") {
    console.error(
      "[Equixity] Missing or empty data-merchant-id attribute on the Equixity " +
        'script tag. Paste the full snippet, e.g. <script src=".../equixity.js" ' +
        'data-merchant-id="YOUR_MERCHANT_ID"></script>. '
    );
    return;
  }

  // Where the SDK itself was loaded from is where its API lives, so a local or
  // preview deployment works without any extra configuration.
  var apiBase = (function () {
    var src = tag.getAttribute("src") || "";
    var m = /^(https?:\/\/[^/]+)/.exec(src);
    return m ? m[1] : "";
  })();

  // The wording pattern is fixed; interpolated values are sanitized so a long
  // asset name or amount can never introduce an en/em dash.
  function sanitize(value) {
    return String(value == null ? "" : value).replace(/[\u2013\u2014]/g, "-");
  }

  function assetLabel(assetName) {
    var name = sanitize(assetName);
    if (!name) return "a reward";
    // "Apple" -> "Apple stock"; a name that already says stock stays as-is.
    return /stock/i.test(name) ? name : name + " stock";
  }

  // --- The badge -------------------------------------------------------------
  function renderBadge(rewardEventId, amountUsd, assetName) {
    if (!rewardEventId || document.getElementById("eqx-badge")) return;

    var host = document.createElement("div");
    host.id = "eqx-badge";
    host.setAttribute("role", "status");
    host.style.cssText = [
      "position:fixed",
      "left:16px",
      "bottom:16px",
      "z-index:2147483000",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
    ].join(";");

    var shadow = host.attachShadow({ mode: "open" });
    var style = document.createElement("style");
    style.textContent =
      ".eqx-pill{display:flex;align-items:center;gap:10px;max-width:340px;" +
      "background:#ffffff;border:1px solid #ca9ad0;border-radius:999px;" +
      "box-shadow:0 8px 24px rgba(65,11,83,0.18);padding:10px 14px;}" +
      ".eqx-link{color:#1f2430;font-size:14px;line-height:1.4;" +
      "text-decoration:none;}" +
      ".eqx-link strong{color:#691280;}" +
      ".eqx-link:hover{text-decoration:underline;}" +
      ".eqx-close{flex:none;width:22px;height:22px;border:0;border-radius:50%;" +
      "background:#f3eef5;color:#691280;font-size:13px;line-height:1;" +
      "cursor:pointer;}" +
      ".eqx-close:hover{background:#ca9ad0;color:#ffffff;}";
    shadow.appendChild(style);

    var pill = document.createElement("div");
    pill.className = "eqx-pill";

    var link = document.createElement("a");
    link.className = "eqx-link";
    link.href = apiBase + "/reward/" + encodeURIComponent(rewardEventId);
    link.target = "_blank";
    link.rel = "noopener";
    // Built with textContent, never innerHTML: nothing from the API is ever
    // interpreted as markup on a merchant's page.
    var lead = document.createElement("span");
    lead.textContent = "You earned ";
    var strong = document.createElement("strong");
    // An amount that did not come back is left out rather than shown as a
    // phony "$0.00": a reward that is really zero would not be shown at all.
    var amount = sanitize(amountUsd);
    strong.textContent = amount
      ? "$" + amount + " of " + assetLabel(assetName)
      : assetLabel(assetName);
    var tail = document.createElement("span");
    tail.textContent = ". Click to claim it.";
    link.appendChild(lead);
    link.appendChild(strong);
    link.appendChild(tail);

    var close = document.createElement("button");
    close.className = "eqx-close";
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss");
    close.innerHTML = "&times;";
    close.addEventListener("click", function () {
      host.remove();
    });

    pill.appendChild(link);
    pill.appendChild(close);
    shadow.appendChild(pill);
    document.body.appendChild(host);
  }

  // --- Which purchase is this page about? ------------------------------------
  // Exactly one reference attribute, matching the snippet the merchant pasted.
  var hasOrderId = !!externalOrderId && externalOrderId.trim() !== "";
  var hasSignature =
    !!transactionSignature && transactionSignature.trim() !== "";

  if (hasOrderId && hasSignature) {
    console.error(
      "[Equixity] This page's Equixity tag has BOTH data-order-id and " +
        "data-transaction-signature. Use exactly one: an order id for card " +
        "payments, a transaction signature for Solana payments."
    );
    return;
  }

  if (!hasOrderId && !hasSignature) {
    console.error(
      "[Equixity] This Equixity tag does not say which purchase the page is " +
        "about, so no reward can be found. Add either " +
        'data-order-id="..." (card payments) or ' +
        'data-transaction-signature="..." (Solana payments).'
    );
    return;
  }

  // --- The badge, once a claimable reward is known ---------------------------
  // The amount is passed through exactly as the backend reported it, so a
  // missing one stays missing instead of becoming a fake zero.
  function onRewardFound(json) {
    renderBadge(json.rewardEventId, json.amountUsd, json.assetName || "");
  }

  // --- Fiat mode: wait for the reward to be recorded, then show the badge ----
  function buildRewardExistsUrl() {
    var purchase = hasOrderId
      ? "&externalOrderId=" + encodeURIComponent(externalOrderId)
      : "&transactionSignature=" + encodeURIComponent(transactionSignature);
    return (
      apiBase +
      "/api/public/reward-exists?merchantId=" +
      encodeURIComponent(merchantId) +
      purchase
    );
  }

  function pollRewardExists() {
    var attempts = 0;
    function attempt() {
      attempts += 1;
      if (attempts > MAX_POLLS) return;
      fetch(buildRewardExistsUrl())
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (json) {
          // exists:false or a failed read: the reward is just not recorded yet.
          // Keep looking until the bound.
          if (json && json.exists) {
            onRewardFound(json);
            return;
          }
          setTimeout(attempt, POLL_MS);
        })
        .catch(function () {
          // Transient network failure: keep looking until the bound.
          setTimeout(attempt, POLL_MS);
        });
    }
    attempt();
  }

  // --- Crypto mode: verify the payment, then show the badge ------------------
  // Nobody has verified this payment yet, so the script asks Equixity to. The
  // backend reads the amount from the chain, never from this page, and records
  // the reward against the wallet that paid (spec sections 2 and 4).
  function verifyPayment() {
    var attempts = 0;
    function attempt() {
      attempts += 1;
      if (attempts > MAX_POLLS) return;
      fetch(apiBase + "/api/public/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The ONLY things sent are the signature and the public merchant id.
        body: JSON.stringify({
          merchantId: merchantId,
          transactionSignature: transactionSignature,
        }),
      })
        .then(function (res) {
          return res.json().then(function (json) {
            return { status: res.status, body: json };
          });
        })
        .then(function (out) {
          if (out.status === 200 && out.body && out.body.rewardEventId) {
            // Recorded. The badge appears for a claimable reward, and stays
            // away when rewards are switched off for this merchant.
            if (out.body.status === "pending") {
              onRewardFound({
                rewardEventId: out.body.rewardEventId,
                amountUsd: out.body.rewardUsdcValue,
                assetName: out.body.assetName,
              });
            }
            return;
          }
          // Already recorded, by an earlier load of this page or by the
          // merchant's own backend: the reward is there, so go and find it.
          if (out.status === 409) {
            pollRewardExists();
            return;
          }
          // Rate-limited or a server problem: worth another try.
          if (out.status === 429 || out.status >= 500) {
            setTimeout(attempt, POLL_MS);
            return;
          }
          // Verification can simply be a moment behind the chain, so give a
          // handful of tries before accepting that this payment cannot be
          // matched to a reward.
          if (out.status === 422 && attempts < MAX_VERIFY_ATTEMPTS) {
            setTimeout(attempt, POLL_MS);
            return;
          }
          console.error(
            "[Equixity] " +
              ((out.body && out.body.error) || "Could not verify this payment.")
          );
        })
        .catch(function () {
          // Transient network failure: keep trying until the bound.
          setTimeout(attempt, POLL_MS);
        });
    }
    attempt();
  }

  // --- Start, once the page is ready -----------------------------------------
  function start() {
    if (hasSignature) verifyPayment();
    else pollRewardExists();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
