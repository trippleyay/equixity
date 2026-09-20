import type { Metadata } from "next";
import PageHero from "@/components/site/PageHero";
import Container from "@/components/site/Container";

export const metadata: Metadata = {
  title: "Merchant - Equixity",
  description: "Sign up or sign in to run Equixity rewards on your checkout.",
};

export default function MerchantPage() {
  return (
    <>
      <PageHero eyebrow="Merchant" title="Set up rewards for your checkout.">
        Sign up and sign in are on their way here. Once they&apos;re live,
        this is where a business connects its checkout, picks a reward
        stock, and sets the percentage.
      </PageHero>

      <Container className="max-w-prose py-16 sm:py-20">
        <p className="text-[1.05rem] leading-relaxed text-slate">
          In the meantime, the docs walk through exactly what setup looks
          like once this is open.
        </p>
      </Container>
    </>
  );
}
