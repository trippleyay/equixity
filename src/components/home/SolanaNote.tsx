import Container from "@/components/site/Container";

export default function SolanaNote() {
  return (
    <section className="bg-white py-4">
      <Container>
        <div className="flex flex-col gap-3 rounded-2xl border border-ink/8 px-7 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-ink">Customers already paying with crypto?</p>
            <p className="mt-1 max-w-lg text-[0.95rem] leading-relaxed text-slate">
              If your checkout already takes Solana payment instead of a
              card, Equixity can trigger the same reward straight from that
              payment. Same setup, same one snippet.
            </p>
          </div>
          <a
            href="/docs"
            className="text-[0.95rem] font-medium text-equixity-deep hover:text-equixity-deepDark hover:underline"
          >
            See the Solana payment path
          </a>
        </div>
      </Container>
    </section>
  );
}
