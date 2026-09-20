import type { Metadata } from "next";
import PageHero from "@/components/site/PageHero";
import Container from "@/components/site/Container";

export const metadata: Metadata = {
  title: "Privacy - Equixity",
  description: "Privacy policy for Equixity.",
};

export default function PrivacyPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Privacy policy">
        The full policy is being written and will replace this page before
        Equixity is live for customers.
      </PageHero>

      <Container className="max-w-prose py-16 sm:py-20">
        <p className="text-[1.05rem] leading-relaxed text-slate">
          This section will cover what Equixity collects from businesses and
          customers, how wallet and reward data is handled, and how that
          information is kept secure.
        </p>
      </Container>
    </>
  );
}
