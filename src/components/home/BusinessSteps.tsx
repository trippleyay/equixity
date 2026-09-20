import Container from "@/components/site/Container";

const steps = [
  {
    title: "Create an account",
    detail: "Sign up and connect the checkout you already run.",
  },
  {
    title: "Choose the reward",
    detail:
      "Pick the stock customers earn. Apple, an S&P 500 fund, or anything else you want to back.",
  },
  {
    title: "Set the percentage",
    detail: "Decide what share of each sale turns into a reward.",
  },
  {
    title: "Add one snippet",
    detail: "Drop a small piece of code into your existing checkout. That's the whole integration.",
  },
];

export default function BusinessSteps() {
  return (
    <section id="how-it-works" className="bg-white py-24 sm:py-28">
      <Container className="grid gap-14 lg:grid-cols-[0.85fr_1fr] lg:gap-20">
        <div>
          <p className="font-display text-lg italic text-equixity-deep">For businesses</p>
          <h2 className="mt-3 font-display text-3xl font-medium leading-tight text-ink sm:text-4xl">
            Set up a rewards program without building one.
          </h2>
          <p className="mt-5 max-w-md text-[1.05rem] leading-relaxed text-slate">
            Equixity plugs into the checkout you already have. Once it&apos;s
            live, every qualifying sale sends a small piece of real stock to
            the customer on its own. No new payment system, no wallet to
            manage, nothing customer-facing for you to build.
          </p>
        </div>

        <ol className="space-y-8">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-5">
              <span className="mt-0.5 font-display text-xl font-medium text-equixity-soft">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="font-medium text-ink">{step.title}</p>
                <p className="mt-1.5 text-[0.95rem] leading-relaxed text-slate">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
