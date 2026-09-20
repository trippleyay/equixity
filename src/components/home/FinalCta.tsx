import Button from "@/components/site/Button";
import Container from "@/components/site/Container";

export default function FinalCta() {
  return (
    <section className="bg-equixity-deep py-24 sm:py-28">
      <Container className="text-center">
        <h2 className="mx-auto max-w-xl font-display text-3xl font-medium leading-tight text-white sm:text-4xl">
          Every sale is a chance to make someone an owner.
        </h2>
        <p className="mx-auto mt-5 max-w-md text-[1.05rem] leading-relaxed text-white/80">
          Set up Equixity in an afternoon. No new payment systems required;
          we handle the reward distribution for you.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Button href="/merchant" variant="onDark">
            Reward Customers
          </Button>
          <Button href="/docs" variant="outlineOnDark">
            Read the docs
          </Button>
        </div>
      </Container>
    </section>
  );
}
