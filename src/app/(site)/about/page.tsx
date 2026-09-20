import type { Metadata } from "next";
import PageHero from "@/components/site/PageHero";
import Container from "@/components/site/Container";

export const metadata: Metadata = {
  title: "About - Equixity",
  description: "Why Equixity exists and what it's building toward.",
};

export default function AboutPage() {
  return (
    <>
      <PageHero eyebrow="About" title="Ownership, made ordinary.">
        Loyalty programs have trained people to expect very little back for
        their money. Equixity started from a simple question: what if the
        reward was something that actually kept its value?
      </PageHero>

      <Container className="max-w-prose py-16 sm:py-20">
        <div className="space-y-6 text-[1.05rem] leading-relaxed text-slate">
          <p>
            Points expire. Cash back gets spent. Neither one changes how a
            person relates to money over time. A small piece of real, tokenized
            stock does, even if it's a tiny amount to start.
          </p>
          <p>
            We built Equixity so that businesses don&apos;t have to choose
            between a rewards program and a new engineering project. One
            snippet, and every qualifying sale can make a customer an owner
            instead of a spender.
          </p>
          <p>
            This page will carry more of that story soon, including who is
            building it and why. For now, the docs are the fastest way to see
            how the whole thing actually works.
          </p>
        </div>
      </Container>
    </>
  );
}
