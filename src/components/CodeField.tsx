"use client";

import { CopyButton } from "@/components/CopyButton";

/**
 * A monospace value with its own copy button: webhook addresses, parameters and
 * generated secrets. Used by the setup guides so every pasteable value looks and
 * behaves the same way.
 */
export function CodeField({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <code className="min-w-0 break-all rounded-xl bg-equixity-mist/70 px-3 py-1.5 text-xs text-ink">
        {value}
      </code>
      <CopyButton value={value} label={label} />
    </div>
  );
}
