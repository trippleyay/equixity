import Button from "@/components/site/Button";
import Container from "@/components/site/Container";

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
      <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-transparent to-white sm:h-8" />

      <Container className="relative z-10 pb-28 pt-28 sm:pb-32">
        <div className="max-w-2xl">
          <h1 className="font-display text-[2.5rem] font-medium leading-[1.1] text-white sm:text-5xl lg:text-6xl">
            Stock rewards with every purchase.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/85">
            Gift tokenized stock when customers buy from you. We handle the
            rewards, you focus on selling.
          </p>
          <div className="mt-9">
            <Button href="/merchant" variant="onDark">
              Reward Customers
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
