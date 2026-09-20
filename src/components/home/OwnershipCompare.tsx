import Container from "@/components/site/Container";

const expiring = [
  "Expires on a schedule the program sets",
  "Only spendable inside that one program",
  "Resets to zero the moment you stop shopping there",
];

const lasting = [
  "Moves with the market, like any other holding",
  "Lives in a wallet that's yours, not the program's",
  "Still there next year, whether or not you buy again",
];

export default function OwnershipCompare() {
  return (
    <section className="bg-white py-24 sm:py-28">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-medium leading-tight text-ink sm:text-4xl">
            Ownership keeps existing after the sale.
          </h2>
          <p className="mt-5 text-[1.05rem] leading-relaxed text-slate">
            Points expire. Cash back is just cash you already had. Equity is
            the only reward that keeps going on its own, long after the
            purchase that earned it.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-dashed border-ink/15 p-8">
            <p className="text-sm font-medium text-slate">Points and cash back</p>
            <ul className="mt-5 space-y-3">
              {expiring.map((line) => (
                <li key={line} className="text-[0.95rem] leading-relaxed text-slate">
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-equixity-deep/25 bg-equixity-mist p-8">
            <p className="text-sm font-medium text-equixity-deep">Ownership, through Equixity</p>
            <ul className="mt-5 space-y-3">
              {lasting.map((line) => (
                <li key={line} className="text-[0.95rem] leading-relaxed text-ink">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mx-auto mt-14 max-w-2xl text-center text-[1.05rem] leading-relaxed text-slate">
          For a lot of people, this is also the easier way into owning stock
          in the first place. Outside the US especially, buying real shares
          the traditional way can mean a broker, an account minimum, or
          paperwork that assumes you already know the process. Here, it
          happens as a side effect of a purchase you were already making.
        </p>
      </Container>
    </section>
  );
}
