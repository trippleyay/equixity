/**
 * Equixity — Merchant SDK (spec sections 4 and 6).
 *
 * Served statically at /equixity.js (public dir). Loaded by pasting:
 *
 *   <script
 *     src="https://equixity.app/equixity.js"
 *     data-merchant-id="MERCHANT_ID">
 *   </script>
 *
 * Behavior:
 *   - Reads data-merchant-id from its own <script> tag on load.
 *   - If missing: console.error a clear message and do NOT attach
 *     window.Equixity — fail loud in dev tools, don't silently no-op.
 *   - Exposes window.Equixity.complete({ transactionSignature, onSuccess,
 *     onError }), which POSTs to the real verification backend and hands back
 *     the claim link.
 *
 * The SDK deliberately CALCULATES NOTHING. The reward amount and asset come from
 * the verification endpoint (spec section 4), so what the customer sees can
 * never drift from what the backend verified. This file only validates shapes,
 * calls the API, and surfaces the result.
 *
 * The call is cross-origin by design (the merchant's checkout lives on their own
 * domain) and the endpoint accepts any origin with no credentials, which is safe
 * because it carries no session or cookies.
 */
(function () {
  "use strict";

  var SCRIPT_MATCH = /\/equixity\.js(?:\?.*)?$/;

  function findOwnScriptTag() {
    var scripts = document.querySelectorAll("script[data-merchant-id]");
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].getAttribute("src") || "";
      if (SCRIPT_MATCH.test(src)) return scripts[i];
    }
    return scripts.length ? scripts[0] : null;
  }

  var tag = findOwnScriptTag();
  var merchantId = tag ? tag.getAttribute("data-merchant-id") : null;

  if (!merchantId || merchantId.trim() === "") {
    console.error(
      "[Equixity] Missing or empty data-merchant-id attribute on the Equixity " +
        'script tag. Paste the full snippet, e.g. <script src=".../equixity.js" ' +
        'data-merchant-id="YOUR_MERCHANT_ID"></script>. window.Equixity will not ' +
        "be attached."
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
      // amount is ever supplied by the client — the backend reads it from the
      // verified on-chain transaction (spec section 4 step 5).
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
        console.log("[Equixity] Reward verified:", json);
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