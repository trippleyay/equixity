import Button from "@/components/site/Button";
import Container from "@/components/site/Container";
import CustomerRewardsButton from "@/components/CustomerRewardsButton";

export default function Hero() {
  return (
    <section className="relative flex min-h-[100svh] items-center overflow-hidden bg-equixity-deep">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/hero-animated.svg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <Container className="relative z-10 pb-28 pt-28 sm:pb-32">
        <div className="max-w-2xl">
          <h1 className="font-display text-[2.5rem] font-medium leading-[1.1] text-white sm:text-5xl lg:text-6xl">
            Stock rewards with every purchase.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/85">
            Gift tokenized stock when customers buy from you. We handle the
            rewards, you focus on selling.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button href="/login" variant="onDark">
              Reward Customers
            </Button>
            {/*
              The customer's way back in. A shopper who earned stock last week
              has no account and no bookmark, so without this the reward they
              were given is unreachable. Outline, because it is the second
              action in the hero, not the primary one.
            */}
            <CustomerRewardsButton />
          </div>
        </div>
      </Container>
    </section>
  );
}
