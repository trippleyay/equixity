import { env } from "@/lib/env";

/**
 * SDK snippet (spec section 6). Returns the <script> tag a merchant pastes into
 * their checkout. It carries ONLY the merchant's public ID — never the internal
 * primary key, never any secret (spec sections 2, 6, 8).
 *
 * The base URL is env-driven so the copied snippet works against a local /
 * preview deploy; it defaults to the production value from spec section 6.
 */
const DEFAULT_SDK_BASE_URL = "https://equixity.app";

export function buildSdkSnippet(publicId: string): string {
  const base = (env.nextPublicAppUrl || DEFAULT_SDK_BASE_URL).replace(/\/+$/, "");
  // Intentional raw HTML string; it is served as a literal snippet to copy.
  return `<script src="${base}/equixity.js" data-merchant-id="${publicId}"></script>`;
}