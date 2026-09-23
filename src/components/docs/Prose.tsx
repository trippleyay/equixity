import { ReactNode } from "react";

/**
 * Shared typography for the docs pages. Kept here rather than repeated in every
 * page so five documents cannot drift apart in spacing or heading weight.
 * Server components: these pages are static prose, nothing here is interactive.
 */

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-14 font-display text-2xl font-medium leading-snug text-ink first:mt-0 sm:text-[1.75rem]">
      {children}
    </h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-10 text-[1.05rem] font-medium text-ink">{children}</h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 text-[1.05rem] leading-relaxed text-slate">{children}</p>
  );
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-4 list-disc space-y-2.5 pl-5 text-[1.05rem] leading-relaxed text-slate marker:text-equixity-soft">
      {children}
    </ul>
  );
}

export function LI({ children }: { children: ReactNode }) {
  return <li className="pl-1">{children}</li>;
}

/** A short aside. Used for policy notes and gotchas readers must not miss. */
export function Note({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-ink/10 bg-equixity-mist/40 p-5">
      {title && <p className="text-sm font-medium text-equixity-deep">{title}</p>}
      <div className="text-[1rem] leading-relaxed text-slate">
        {children}
      </div>
    </div>
  );
}

/** A value that appears in code or a dashboard field, inline in a sentence. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  );
}

/** Emphasis for a dashboard label inside a sentence, where a link would be noise. */
export function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-ink">{children}</span>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="font-medium text-equixity-deep underline-offset-4 hover:underline"
    >
      {children}
    </a>
  );
}

/**
 * A definition-style table for reference material (statuses, endpoints, limits).
 * `head` is the column headers, `rows` one array per row.
 */
export function Table({
  head,
  rows,
}: {
  head: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-[0.95rem]">
        <thead>
          <tr className="border-b border-ink/10">
            {head.map((cell) => (
              <th
                key={cell}
                className="py-3 pr-5 text-xs font-medium uppercase tracking-[0.12em] text-slate"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-ink/5 align-top">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`py-3.5 pr-5 leading-relaxed ${
                    j === 0 ? "font-medium text-ink" : "text-slate"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
