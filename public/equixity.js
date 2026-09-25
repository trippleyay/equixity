/**
 * Equixity: merchant notification SDK (reward-delivery spec section 3).
 *
 * Served statically at /equixity.js (public dir). Loaded by pasting ONE tag
 * into the merchant's own SUCCESS PAGE, the page the customer lands on after
 * paying. That is the only supported placement, and the tag carries nothing
 * but the merchant's public id:
 *
 *   <script src="https://equixity.app/equixity.js"
 *           data-merchant-id="MERCHANT_ID"></script>
 *
 * WHICH PURCHASE IS THIS PAGE ABOUT? The tag does not say, and nobody edits
 * anything per order. The answer is in the customer's address bar, because
 * that address is the one thing the checkout and the success page share:
 *
 *   Stripe      ?session_id=cs_live_...  (Stripe fills the value in itself)
 *   Flutterwave ?tx_ref=...              (Flutterwave appends it on redirect)
 *   Own backend ?order_id=...
 *
 * Solana payments (dormant): ?signature=... is still accepted and verified on
 * chain, but no setup or snippet for it is offered while crypto is not part
 * of the product.
 *
 * Exactly one KIND of reference may be present. Both kinds at once, or
 * neither, is a page that cannot name its purchase: the script explains that
 * in the console and does nothing else. A payment whose address carries a
 * non-success status value is a NORMAL outcome (Flutterwave sends cancelled
 * payments to the same redirect address), so the script stays completely
 * quiet for those.
 *
 * This is ALL that ever touches the merchant's page: a small, dismissible
 * badge saying a reward is waiting, linking to the hosted reward page at
 * /reward/{rewardEventId}. No checkbox, no wallet choice, no blocked message,
 * no eligibility logic of any kind lives here; the full flow runs on the
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
 * The reference is left in the address when we are done with it. Merchant
 * pages legitimately read the same values (Stripe's own docs have the success
 * page look the session up), so removing them could break their page.
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
  // A processor webhook normally lands within a second or two of the customer
  // reaching the success page, so the schedule starts tight and relaxes. A flat
  // 3s from the first attempt meant a reward that was already recorded could sit
  // unseen for 3 seconds for no reason, which is the whole wait the customer
  // notices. Delays are in ms per attempt: 300, 600, 900, 1200, then 2000 flat.
  var POLL_SCHEDULE = [300, 600, 900, 1200];
  var POLL_MS = 2000;
  // Crypto only: verification may simply be a moment behind the chain, so a
  // few retries are worth it. Anything past this is a payment this page cannot
  // fix by trying again.
  var MAX_VERIFY_ATTEMPTS = 5;

  /** Delay before attempt N (1-based): tight early, relaxed after. */
  function pollDelay(attempt) {
    return POLL_SCHEDULE[attempt - 1] || POLL_MS;
  }

  // The purchase reference arrives in the page address. Fiat names, then the
  // dormant Solana names.
  var FIAT_PARAMS = ["session_id", "tx_ref", "order_id", "external_order_id"];
  var CRYPTO_PARAMS = ["signature", "tx", "transaction_signature"];
  // A pasted template value is never a real reference.
  var PLACEHOLDER_RE = /^(ORDER_ID|TRANSACTION_SIGNATURE|\{[^}]*\})$/;
  var SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9]+$/;
  // Flutterwave marks the redirect outcome with status; anything other than
  // this value means the payment did not complete.
  var SUCCESS_STATUS = "successful";

  function findOwnScriptTag() {
    var candidates = document.querySelectorAll("script[data-merchant-id]");
    for (var i = 0; i < candidates.length; i++) {
      var src = candidates[i].getAttribute("src") || "";
      if (SCRIPT_MATCH.test(src)) return candidates[i];
    }
    return candidates.length ? candidates[0] : null;
  }

  var tag = findOwnScriptTag();
  var merchantId = tag ? tag.getAttribute("data-merchant-id") : null;

  if (!merchantId || merchantId.trim() === "") {
    console.error(
      "[Equixity] Missing or empty data-merchant-id attribute on the Equixity " +
        'script tag. Paste the full snippet: <script src=".../equixity.js" ' +
        'data-merchant-id="YOUR_MERCHANT_ID"></script>.'
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
    // Append "stock" unless the API's asset name already includes it.
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
      "left:50%",
      "top:50%",
      "transform:translate(-50%,-50%)",
      "width:min(560px,calc(100vw - 32px))",
      "z-index:2147483000",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
    ].join(";");

    var shadow = host.attachShadow({ mode: "open" });
    var style = document.createElement("style");
    style.textContent =
      ".eqx-card{display:flex;align-items:center;gap:18px;box-sizing:border-box;" +
      "background:linear-gradient(135deg,rgba(255,255,255,0.96),rgba(239,227,247,0.92));" +
      "border:1px solid rgba(105,18,128,0.24);border-radius:18px;" +
      "box-shadow:0 24px 70px rgba(41,7,53,0.28),inset 0 1px 0 rgba(255,255,255,0.9);" +
      "padding:24px 24px 24px 22px;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);}" +
      ".eqx-logo{width:66px;height:66px;flex:none;object-fit:contain;}" +
      ".eqx-link{display:block;flex:1;color:#1f2430;font-size:16px;line-height:1.5;" +
      "text-decoration:none;font-weight:450;}" +
      ".eqx-link strong{color:#691280;font-weight:700;}" +
      ".eqx-close{flex:none;width:32px;height:32px;border:0;border-radius:10px;" +
      "background:rgba(105,18,128,0.09);color:#691280;font-size:20px;line-height:1;" +
      "cursor:pointer;transition:background .15s,color .15s;}" +
      ".eqx-close:hover{background:#691280;color:#ffffff;}" +
      "@media(max-width:520px){.eqx-card{gap:13px;padding:18px;}" +
      ".eqx-logo{width:50px;height:50px;}.eqx-link{font-size:14px;}}";
    shadow.appendChild(style);

    var card = document.createElement("div");
    card.className = "eqx-card";

    var logo = document.createElement("img");
    logo.className = "eqx-logo";
    logo.src = apiBase + "/purple-giftbox.svg";
    logo.alt = "";

    var link = document.createElement("a");
    link.className = "eqx-link";
    link.href = apiBase + "/reward/" + encodeURIComponent(rewardEventId);
    link.target = "_blank";
    link.rel = "noopener";
    // Built with textContent, never innerHTML: nothing from the API is ever
    // interpreted as markup on a merchant's page.
    var lead = document.createElement("span");
    lead.textContent = "Your order just earned you ";
    var strong = document.createElement("strong");
    // An amount that did not come back is left out rather than shown as a
    // phony "$0.00": a reward that is really zero would not be shown at all.
    var amount = sanitize(amountUsd);
    strong.textContent = amount
      ? "$" + amount + " of " + assetLabel(assetName)
      : assetLabel(assetName);
    var tail = document.createElement("span");
    tail.textContent = "! Click here to grab your reward.";
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

    card.appendChild(logo);
    card.appendChild(link);
    card.appendChild(close);
    shadow.appendChild(card);
    document.body.appendChild(host);
  }

  // --- Which purchase is this page about? ------------------------------------
  // The reference lives in the page address, because that address is the one
  // thing the checkout and this page share. Read from window.location.search,
  // falling back to the href, so either harness or browser shape works.
  function readAddressParams() {
    var query = "";
    try {
      query = (window.location && window.location.search) || "";
      if (!query && window.location && window.location.href) {
        var q = String(window.location.href).indexOf("?");
        if (q !== -1) query = String(window.location.href).slice(q);
      }
    } catch (e) {
      query = "";
    }
    var out = [];
    if (query.charAt(0) === "?") query = query.slice(1);
    if (!query) return out;
    var pairs = query.split("&");
    for (var i = 0; i < pairs.length; i++) {
      var eq = pairs[i].indexOf("=");
      var name = eq === -1 ? pairs[i] : pairs[i].slice(0, eq);
      var value = eq === -1 ? "" : pairs[i].slice(eq + 1);
      try {
        name = decodeURIComponent(name.replace(/\+/g, " "));
        value = decodeURIComponent(value.replace(/\+/g, " "));
      } catch (e) {
        // A malformed escape must not take the whole page down.
        continue;
      }
      out.push({ name: name, value: value });
    }
    return out;
  }

  // A pasted template value is never a real reference. Covers the old copy
  // placeholders and any {LIKE_THIS} template token a merchant left verbatim.
  function isPlaceholderLiteral(value) {
    return PLACEHOLDER_RE.test(value);
  }

  function findPurchaseReference() {
    var params = readAddressParams();

    // Flutterwave sends cancelled payments to the SAME redirect address with a
    // status value. A non-success status is a normal outcome, not an error:
    // stay completely quiet and make no requests at all.
    for (var s = 0; s < params.length; s++) {
      if (params[s].name === "status" && params[s].value !== SUCCESS_STATUS) {
        return { kind: "cancelled" };
      }
    }

    var fiatRefs = [];
    var cryptoRefs = [];
    var sawPlaceholder = null;
    var sawMangled = false;

    for (var i = 0; i < params.length; i++) {
      var name = params[i].name;
      var value = params[i].value;
      if (!value || value.trim() === "") continue;
      value = value.trim();

      if (isPlaceholderLiteral(value)) {
        sawPlaceholder = value;
        continue;
      }

      var isCryptoName = CRYPTO_PARAMS.indexOf(name) !== -1;
      var isFiatName = FIAT_PARAMS.indexOf(name) !== -1;
      // A Stripe session id is recognizable by its shape wherever it hides:
      // the parameter NAME is the merchant's choice, the cs_ prefix is not.
      var looksLikeSessionId = SESSION_ID_RE.test(value);

      if (name === "session_id" && !looksLikeSessionId && value.indexOf("session_id=") !== -1) {
        // The placeholder was appended twice (e.g. ...?session_id=cs_1?session_id=cs_1),
        // producing one mangled value. Polling it would quietly never work.
        sawMangled = true;
        continue;
      }

      if (isCryptoName) {
        cryptoRefs.push(value);
      } else if (isFiatName || looksLikeSessionId) {
        fiatRefs.push({ value: value, shaped: looksLikeSessionId });
      }
    }

    if (sawMangled) {
      return {
        kind: "error",
        message:
          "[Equixity] The session_id value in this page's address looks like it " +
          "contains the placeholder twice. In your payment provider's redirect " +
          "setting, the address should contain session_id={CHECKOUT_SESSION_ID} " +
          "exactly once."
      };
    }

    // A template token left verbatim is a setup mistake worth naming exactly.
    if (fiatRefs.length === 0 && cryptoRefs.length === 0 && sawPlaceholder) {
      return {
        kind: "error",
        message:
          "[Equixity] The value \"" + sawPlaceholder + "\" in this page's address " +
          "is a placeholder, not a real order reference. Your payment provider " +
          "or checkout fills the real value in automatically when it redirects " +
          "the customer here."
      };
    }

    if (fiatRefs.length > 0 && cryptoRefs.length > 0) {
      return {
        kind: "error",
        message:
          "[Equixity] This page's address carries BOTH a card order reference and " +
          "a Solana signature. Use exactly one kind per page."
      };
    }

    if (fiatRefs.length > 0) {
      // Prefer a well-formed Stripe session id when several names are present.
      var shaped = null;
      for (var f = 0; f < fiatRefs.length; f++) {
        if (fiatRefs[f].shaped) { shaped = fiatRefs[f].value; break; }
      }
      return { kind: "fiat", orderId: shaped || fiatRefs[0].value };
    }

    if (cryptoRefs.length > 0) {
      return { kind: "crypto", signature: cryptoRefs[0] };
    }

    return {
      kind: "error",
      message:
        "[Equixity] This page's address does not say which purchase it is about, " +
        "so no reward can be found. Your payment provider's redirect setting " +
        "should send the customer here with the order reference in the address " +
        '(Stripe: add session_id={CHECKOUT_SESSION_ID} to the redirect address; ' +
        'Flutterwave adds tx_ref automatically; your own backend: ?order_id=...).'
    };
  }

  var reference = findPurchaseReference();

  // --- The badge, once a claimable reward is known ---------------------------
  // The amount is passed through exactly as the backend reported it, so a
  // missing one stays missing instead of becoming a fake zero.
  function onRewardFound(json) {
    renderBadge(json.rewardEventId, json.amountUsd, json.assetName || "");
  }

  // --- Fiat mode: wait for the reward to be recorded, then show the badge ----
  function buildRewardExistsUrl() {
    // Exactly one reference kind reaches this function (resolveReference
    // refuses pages that carry both), and the existence endpoint accepts
    // exactly one of the two params, so the kind decides the param.
    var purchase =
      reference.kind === "crypto"
        ? "&transactionSignature=" + encodeURIComponent(reference.signature)
        : "&externalOrderId=" + encodeURIComponent(reference.orderId);
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
          setTimeout(attempt, pollDelay(attempts));
        })
        .catch(function () {
          // Transient network failure: keep looking until the bound.
          setTimeout(attempt, pollDelay(attempts));
        });
    }
    // Check immediately: if the webhook already landed, the badge appears with
    // no delay at all rather than waiting out a first interval.
    attempt();
  }

  // --- Crypto mode (dormant): verify the payment, then show the badge --------
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
          transactionSignature: reference.signature,
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
          // Already recorded, by an earlier load of this page: the reward is
          // there, so go and find it.
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
    if (reference.kind === "crypto") verifyPayment();
    else if (reference.kind === "fiat") pollRewardExists();
    // "cancelled" and "error" were already explained (or deliberately quiet).
    if (reference.kind === "error" && reference.message) {
      console.error(reference.message);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
