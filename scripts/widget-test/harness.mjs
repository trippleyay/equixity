import { makeEl, textOf, linksOf, check, WIDGET, API, MERCHANT, summary } from "./dom.mjs";
import vm from "node:vm";
export { makeEl, check, WIDGET, API, MERCHANT, summary };

/**
 * Runs the real widget on a simulated success page and a scripted fetch.
 * `url` is the page address the widget resolves the purchase reference from.
 * Scheduled retries are drained synchronously so retry loops finish fast.
 */
export async function run({ tags, fetchImpl, apiBase = API, url = "https://merchant.test/thank-you" }) {
  const byId = new Map();
  const bodyChildren = [];
  const body = {
    appendChild(c) {
      bodyChildren.push(c);
      c.parent = body;
      return c;
    },
    children: bodyChildren,
  };

  const document = {
    readyState: "complete",
    body,
    head: { appendChild() {} },
    createElement: (t) => makeEl(t),
    getElementById: (id) => byId.get(id) || null,
    querySelectorAll: () => tags,
    addEventListener() {},
  };
  const origCreate = document.createElement;
  document.createElement = (t) => {
    const el = origCreate(t);
    const armed = el;
    Object.defineProperty(armed, "id", {
      get() {
        return this._id || null;
      },
      set(v) {
        this._id = v;
        if (v) byId.set(v, this);
      },
    });
    return armed;
  };

  const errors = [];
  const fetchCalls = [];
  const timers = [];
  const sandbox = {
    console: {
      error: (...a) => errors.push(a.join(" ")),
      warn: (...a) => errors.push(a.join(" ")),
      log: () => {},
    },
    document,
    window: { document, location: { href: url } },
    fetch: async (u, opts) => {
      fetchCalls.push({ url: u, opts });
      return fetchImpl(u, opts);
    },
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    setInterval: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearInterval: () => {},
    clearTimeout: () => {},
    Promise,
    URL,
    JSON,
    RegExp,
    Object,
    Array,
    Boolean,
    String,
    Number,
    Math,
    Error,
    encodeURIComponent,
    decodeURIComponent,
  };

  vm.createContext(sandbox);
  vm.runInContext(WIDGET, sandbox, { filename: "equixity.js" });

  // Drain: let promises settle, then run every scheduled retry, repeatedly.
  const settle = async () => {
    for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
  };
  for (let round = 0; round < 30; round++) {
    await settle();
    const pending = timers.splice(0, timers.length);
    if (pending.length === 0) break;
    for (const t of pending) {
      try {
        t.fn();
      } catch (e) {
        errors.push("timer threw: " + e.message);
      }
    }
  }
  await settle();

  const appended = bodyChildren;
  return {
    appended,
    errors,
    fetchCalls,
    badgeText: appended.map((n) => textOf(n)).join(" | "),
    badgeLinks: appended.flatMap((n) => linksOf(n)),
  };
}
