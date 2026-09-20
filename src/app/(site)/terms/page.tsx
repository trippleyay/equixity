import type { Metadata } from "next";
import PageHero from "@/components/site/PageHero";
import Container from "@/components/site/Container";

export const metadata: Metadata = {
  title: "Terms - Equixity",
  description: "Terms of service for Equixity.",
};

export default function TermsPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Terms of service">
        The full terms are being written and will replace this page before
        Equixity is live for customers.
      </PageHero>

      <Container className="max-w-prose py-16 sm:py-20">
        <p className="text-[1.05rem] leading-relaxed text-slate">
          This section will cover how accounts work, how rewards are
          calculated and delivered, and what businesses and customers can
          expect from Equixity.
        </p>
      </Container>
    </>
  );
}
