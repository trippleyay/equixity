/**
 * Functional test for the SHIPPED file public/equixity.js, run in a fake DOM
 * against a scripted fetch. The widget now resolves the purchase reference
 * from the page ADDRESS, so the harness drives window.location too.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
function summary() {
  return { passed, failed };
}
export { makeEl, textOf, linksOf, check, WIDGET, API, MERCHANT, summary };

const WIDGET = readFileSync(
  new URL("../../public/equixity.js", import.meta.url),
  "utf8",
);
const API = "https://api.test";
const MERCHANT = "11111111-1111-1111-1111-111111111111";

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log("  PASS  " + name);
  } else {
    failed++;
    console.log("  FAIL  " + name + (extra ? " <= " + extra : ""));
  }
}

function makeEl(tagName = "div", attrs = {}) {
  const el = {
    _tagName: tagName,
    _attrs: attrs,
    children: [],
    style: {},
    classList: { add() {}, remove() {} },
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    setAttribute: (k, v) => (attrs[k] = v),
    appendChild(c) {
      this.children.push(c);
      c.parent = this;
      return c;
    },
    attachShadow() {
      this.shadowRoot = makeEl("shadow");
      return this.shadowRoot;
    },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    },
    addEventListener(t, fn) {
      (this._listeners ||= {});
      (this._listeners[t] ||= []).push(fn);
    },
    fire(t) {
      (this._listeners?.[t] || []).forEach((fn) => fn());
    },
    get id() {
      return this._id || null;
    },
    set id(v) {
      this._id = v;
    },
  };
  return el;
}

function textOf(node) {
  if (!node) return "";
  const parts = [];
  if (typeof node.textContent === "string") parts.push(node.textContent);
  for (const c of node.children || []) parts.push(textOf(c));
  if (node.shadowRoot) parts.push(textOf(node.shadowRoot));
  return parts.join(" ");
}

function linksOf(node, out = []) {
  if (!node) return out;
  if (typeof node.href === "string") out.push(node.href);
  for (const c of node.children || []) linksOf(c, out);
  if (node.shadowRoot) linksOf(node.shadowRoot, out);
  return out;
}
