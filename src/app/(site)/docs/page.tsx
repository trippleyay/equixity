import type { Metadata } from "next";
import PageHero from "@/components/site/PageHero";
import Container from "@/components/site/Container";

export const metadata: Metadata = {
  title: "Docs - Equixity",
  description: "Integration guides and reference for Equixity.",
};

const sections = [
  {
    title: "Getting started",
    detail: "Create an account and connect a checkout in a few minutes.",
  },
  {
    title: "Configuring rewards",
    detail: "Choose the stock and the percentage of each sale it corresponds to.",
  },
  {
    title: "The checkout snippet",
    detail: "The one piece of code that ties a sale to a reward.",
  },
  {
    title: "On-chain verification for Solana",
    detail: "The setup for businesses already running on Solana.",
  },
  {
    title: "API reference",
    detail: "Endpoints for reward events, wallet status, and account settings.",
  },
];

export default function DocsPage() {
  return (
    <>
      <PageHero eyebrow="Docs" title="Everything you need to plug in Equixity.">
        Full guides are on their way. Here&apos;s what this section will
        cover once it&apos;s written.
      </PageHero>

      <Container className="py-16 sm:py-20">
        <div className="grid gap-6 sm:grid-cols-2">
          {sections.map((section) => (
            <div
              key={section.title}
              className="rounded-2xl border border-ink/8 p-7"
            >
              <p className="font-medium text-ink">{section.title}</p>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-slate">
                {section.detail}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </>
  );
}
