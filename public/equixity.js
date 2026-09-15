/**
 * Equixity — Merchant SDK (spec section 6).
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
 *   - If present: expose window.Equixity.complete({ transactionSignature }).
 *
 * complete() validates its input SHAPE only in this build. The
 * purchase-verification backend it will eventually call is a separate,
 * explicitly out-of-scope build (spec section 9). The interface is kept stable
 * so that build can wire in without touching this file's public surface.
 *
 * NOTE (spec section 6): once complete() calls a real API, that call is
 * cross-origin from whatever domain the merchant's checkout lives on, so that
 * future endpoint will need CORS headers scoped to accept any origin. Nothing
 * to build today — just don't design that endpoint assuming same-origin.
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

  function complete(options) {
    if (!options || typeof options !== "object") {
      console.error(
        '[Equixity] complete() expects an options object, e.g. ' +
          'Equixity.complete({ transactionSignature: "..." }).'
      );
      return false;
    }
    var transactionSignature = options.transactionSignature;
    if (
      typeof transactionSignature !== "string" ||
      transactionSignature.trim() === ""
    ) {
      console.error(
        "[Equixity] complete() requires a non-empty transactionSignature string."
      );
      return false;
    }
    // FUTURE (out of scope): hand `transactionSignature` to the purchase-
    // verification endpoint, which must accept any CORS origin. Interface is
    // stable; nothing sends yet.
    return true;
  }

  window.Equixity = Object.freeze({ complete: complete });
})();