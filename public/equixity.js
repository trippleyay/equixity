/**
 * Equixity — Merchant notification SDK (reward-delivery spec section 3).
 *
 * Served statically at /equixity.js (public dir). Loaded by pasting:
 *
 *   Crypto path:
 *   <script src="https://equixity.app/equixity.js" data-merchant-id="MERCHANT_ID"></script>
 *
 *   Fiat path:
 *   <script src="https://equixity.app/equixity.js"
 *           data-merchant-id="MERCHANT_ID"
 *           data-order-id="EXTERNAL_ORDER_ID"></script>
 *
 * This is ALL that ever touches the merchant's page: a small, dismissible
 * badge saying a reward is waiting, linking to the hosted reward page at
 * /reward/{rewardEventId}. No checkbox, no wallet choice, no blocked message,
 * no eligibility logic of any kind lives here — the full flow runs on the
 * hosted page under Equixity's own domain (spec sections 1 and 3a).
 *
 * The SDK deliberately CALCULATES NOTHING. The amount, asset name and reward
 * id come from the Equixity endpoints, so what the customer sees can never
 * drift from what the backend verified. This file only validates shapes,
 * polls /api/public/reward-exists (existence only), calls /api/public/complete
 * for the crypto path, and renders the badge.
 *
 * Cross-origin by design; the endpoints accept any origin with no credentials,
 * which is safe because they carry no session or cookies.
 */
(function () {
  "use strict";

  var SCRIPT_MATCH = /\/equixity\.js(?:\?.*)?$/;
  // One bounded sweep: after this many polls the badge gives up quietly. A
  // webhook that never lands should not poll a merchant's page forever.
  var MAX_POLLS = 60;
  var POLL_MS = 3000;

  function findOwnScriptTag() {
    var candidates = document.querySelectorAll(
      "script[data-merchant-id], script[data-order-id]"
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
    strong.textContent = "$" + sanitize(amountUsd) + " of " + assetLabel(assetName);
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

  // --- Fiat mode: poll existence only, then show the badge -------------------
  function pollRewardExists() {
    if (!externalOrderId || externalOrderId.trim() === "") {
      // Fiat tag without an order id can never find a reward: say so loudly
      // in the console rather than polling pointlessly.
      console.error(
        "[Equixity] data-order-id is empty, so no fiat reward can be found " +
          "for this page."
      );
      return;
    }

    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      if (attempts > MAX_POLLS) {
        clearInterval(timer);
        return;
      }
      fetch(
        apiBase +
          "/api/public/reward-exists?merchantId=" +
          encodeURIComponent(merchantId) +
          "&externalOrderId=" +
          encodeURIComponent(externalOrderId)
      )
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (json) {
          if (json && json.exists) {
            clearInterval(timer);
            renderBadge(
              json.rewardEventId,
              json.amountUsd || "0.00",
              json.assetName || ""
            );
          }
          // exists:false or a failed read: the webhook just has not landed
          // yet. Keep polling until the bound.
        })
        .catch(function () {
          // Transient network failure: keep polling until the bound.
        });
    }, POLL_MS);
  }

  if (externalOrderId) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", pollRewardExists);
    } else {
      pollRewardExists();
    }
  }

  // --- Crypto mode: complete() then show the badge immediately ---------------
  function complete(options) {
    if (!options || typeof options !== "object") {
      console.error(
        '[Equixity] complete() expects an options object, e.g. ' +
          'Equixity.complete({ transactionSignature: "..." }).'
      );
      return Promise.resolve(null);
    }
    var transactionSignature = options.transactionSignature;
    if (
      typeof transactionSignature !== "string" ||
      transactionSignature.trim() === ""
    ) {
      console.error(
        "[Equixity] complete() requires a non-empty transactionSignature string."
      );
      return Promise.resolve(null);
    }

    var onSuccess =
      typeof options.onSuccess === "function" ? options.onSuccess : null;
    var onError = typeof options.onError === "function" ? options.onError : null;

    return fetch(apiBase + "/api/public/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The ONLY things sent are the signature and the public merchant id. No
      // amount is ever supplied by the client; the backend reads it from the
      // verified on-chain transaction, and the destination wallet is the one
      // that paid (spec section 2).
      body: JSON.stringify({
        merchantId: merchantId,
        transactionSignature: transactionSignature,
      }),
    })
      .then(function (res) {
        return res.json().then(function (json) {
          if (!res.ok) {
            var err = new Error(json && json.error ? json.error : "Request failed");
            err.status = res.status;
            throw err;
          }
          return json;
        });
      })
      .then(function (json) {
        // The moment a rewardEventId exists, the badge appears. No polling.
        if (json && json.rewardEventId && json.status === "pending") {
          renderBadge(
            json.rewardEventId,
            json.rewardUsdcValue || "0.00",
            json.assetName || ""
          );
        }
        if (onSuccess) onSuccess(json);
        return json;
      })
      .catch(function (err) {
        console.error("[Equixity] " + (err && err.message ? err.message : err));
        if (onError) onError(err);
        return null;
      });
  }

  window.Equixity = Object.freeze({ complete: complete });
})();
