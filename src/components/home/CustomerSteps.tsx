import Container from "@/components/site/Container";

const steps = [
  {
    title: "Pay like you always do",
    detail: "Use your usual card. Nothing about checkout changes.",
  },
  {
    title: "Get notified",
    detail: "A message lets you know you earned a piece of real stock.",
  },
  {
    title: "Sign in, if you need to",
    detail:
      "No wallet yet? One is created for you the moment you sign in with an email or Google account. No seed phrase, no exchange, no broker paperwork.",
  },
  {
    title: "It's yours",
    detail: "Hold it, watch it, or send it elsewhere, the same as any other asset you own.",
  },
];

export default function CustomerSteps() {
  return (
    <section className="bg-equixity-mist py-24 sm:py-28">
      <Container className="grid gap-14 lg:grid-cols-[1fr_0.85fr] lg:gap-20">
        <ol className="order-2 space-y-8 lg:order-1">
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

        <div className="order-1 lg:order-2">
          <p className="font-display text-lg italic text-equixity-deep">For customers</p>
          <h2 className="mt-3 font-display text-3xl font-medium leading-tight text-ink sm:text-4xl">
            Owning stock, as a side effect of shopping.
          </h2>
          <p className="mt-5 max-w-md text-[1.05rem] leading-relaxed text-slate">
            There&apos;s nothing to set up before you shop and nothing to
            learn afterward. If you already have a wallet, the reward lands
            there. If you don&apos;t, one is waiting for you the moment you
            sign in.
          </p>
        </div>
      </Container>
    </section>
  );
}
