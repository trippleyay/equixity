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
        Most loyalty programs give you points that expire or cash back that
        disappears the moment you spend it. Equixity gives customers something
        that doesn&apos;t: a real, tokenized piece of the market, earned
        automatically every time they shop.
      </PageHero>

      <Container className="max-w-prose py-16 sm:py-20">
        <div className="space-y-6 text-[1.05rem] leading-relaxed text-slate">
          <p>
            Every purchase is a missed opportunity to build something. Points
            sit locked inside one merchant&apos;s ecosystem. Cash back just
            becomes cash again. Equixity replaces both with actual ownership: a
            fraction of a real stock, like Apple or the S&amp;P 500, delivered
            straight into a wallet the customer controls.
          </p>
          <p>
            Merchants don&apos;t need to become a fintech company to offer it.
            Sign up, choose the stock, set the reward percentage, and connect a
            webhook to the payment provider already running the checkout. Stripe
            and Flutterwave are supported out of the box, with an open API for
            anyone running something custom. There&apos;s no new payment rail to
            adopt and nothing customer-facing to design. Equixity calculates and
            delivers every reward on its own.
          </p>
          <p>
            The experience is built for people who&apos;ve never used crypto and
            never plan to. A customer checks out with a normal card, gets a
            notification that they&apos;ve earned a piece of real stock, and a
            wallet is created for them the moment they sign in with an email or
            a Google account. No seed phrases, no exchanges, no broker
            paperwork. In most of the world, buying stock directly still means
            opening a brokerage account, meeting a minimum, or already knowing
            how the system works. Equixity skips all of it. Ownership becomes
            something that just happens while someone shops.
          </p>
          <p>
            That&apos;s the difference. A point expires. Cash back gets spent.
            Ownership is the only reward built to outlast the transaction that
            created it.
          </p>
        </div>

        <p className="mt-12 border-t border-ink/10 pt-6 text-xs leading-relaxed text-slate/80">
          Equixity is not currently available to businesses serving customers
          based in, or residents of, the United States (including U.S. Persons),
          United Kingdom, Canada, Australia, Mainland China, or any OFAC
          sanctioned jurisdiction.
        </p>
      </Container>
    </>
  );
}
