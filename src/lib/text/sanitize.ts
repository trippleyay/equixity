/**
 * Sanitizes a server-side error string before it is shown to a customer.
 *
 * Provider and RPC error messages can carry newlines, tabs and terminal escape
 * sequences. This keeps the customer-facing UI plain text and bounded in length.
 * Exported from a shared module so the customer endpoints all sanitize the same
 * way rather than each carrying its own copy of the rule.
 */
export function cleanMessage(input: unknown, fallback: string): string {
  const raw = typeof input === "string" ? input : "";
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl =
      code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
    out += isControl ? " " : ch;
  }
  const cleaned = out.replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.length > 200 ? `${cleaned.slice(0, 200)}...` : cleaned;
}
