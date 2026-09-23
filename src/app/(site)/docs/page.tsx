import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/site/PageHero";
import Container from "@/components/site/Container";

export const metadata: Metadata = {
  title: "Docs - Equixity",
  description:
    "How to connect a checkout to Equixity and start issuing stock rewards, written against the live product.",
};

const sections = [
  {
    href: "/docs/getting-started",
    title: "Getting started",
    detail:
      "Create an account, fund your reward balance, and turn rewards on. The whole setup, start to finish.",
  },
  {
    href: "/docs/configuring-rewards",
    title: "Configuring rewards",
    detail:
      "Pick the stock and the percentage of each sale that becomes a reward, and see how a purchase becomes one.",
  },
  {
    href: "/docs/success-page-snippet",
    title: "The success page snippet",
    detail:
      "The one line that turns a completed sale into a reward, and how that page knows which order it belongs to.",
  },
  {
    href: "/docs/connecting-your-checkout",
    title: "Connecting your checkout",
    detail:
      "Stripe and Flutterwave are supported out of the box, or report orders from your own backend.",
  },
  {
    href: "/docs/api-reference",
    title: "API reference",
    detail:
      "Every endpoint an integration touches, with request shapes, responses, and rate limits.",
  },
];

export default function DocsPage() {
  return (
    <>
      <PageHero
        eyebrow="Docs"
        title="Everything you need to plug in Equixity."
      >
        These guides are written against the live product rather than a plan.
        Start with getting started and go as deep as you need.
      </PageHero>

      <Container className="py-16 sm:py-20">
        <div className="grid gap-6 sm:grid-cols-2">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group flex flex-col rounded-2xl border border-ink/10 p-7 transition-colors hover:border-equixity-deep/30 hover:bg-equixity-mist/30"
            >
              <p className="font-medium text-ink group-hover:text-equixity-deep">
                {section.title}
              </p>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-slate">
                {section.detail}
              </p>
              <span
                aria-hidden="true"
                className="mt-5 text-sm font-medium text-equixity-deep"
              >
                Read the guide
              </span>
            </Link>
          ))}
        </div>
      </Container>
    </>
  );
}
