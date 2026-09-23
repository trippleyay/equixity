"use client";

import { CopyButton } from "@/components/CopyButton";

/**
 * The one success-page snippet (spec section 6), shown as the LAST step of every
 * setup guide: Stripe, Flutterwave and the merchant's own checkout all paste this
 * same line. It carries only the merchant's public id; the purchase reference
 * travels in the page address, which each path supplies in its own way.
 */
export function SuccessPageSnippet({ snippet }: { snippet: string }) {
  return (
    <div className="mt-2">
      <pre className="min-w-0 overflow-x-auto rounded-xl bg-equixity-mist/70 p-3 text-xs leading-5">
        <code>{snippet}</code>
      </pre>
      <div className="mt-2">
        <CopyButton value={snippet} label="Copy snippet" />
      </div>
    </div>
  );
}
