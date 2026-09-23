"use client";

import { useState } from "react";

/**
 * A copyable code block for the docs. Client-side only for the copy button and
 * its "Copied" state; the code itself is passed in as a plain string.
 *
 * `label` is announced to screen readers alongside the button, since every
 * block on a page otherwise has a button called "Copy".
 */
export default function CodeBlock({
  code,
  label = "code",
  copyLabel = "Copy",
}: {
  code: string;
  label?: string;
  copyLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (insecure origin, denied permission). Leave the
      // block selectable rather than pretending the copy worked.
    }
  }

  return (
    <div className="relative mt-5">
      <pre className="overflow-x-auto rounded-2xl bg-ink px-5 py-5 pr-24 font-mono text-[0.82rem] leading-relaxed text-white/90">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={`${copyLabel} ${label}`}
        className="absolute right-3 top-3 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
      >
        {copied ? "Copied" : copyLabel}
      </button>
    </div>
  );
}
