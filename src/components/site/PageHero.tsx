import { ReactNode } from "react";
import Container from "./Container";

export default function PageHero({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <section className="bg-equixity-mist pb-16 pt-40 sm:pt-44">
      <Container>
        <p className="font-display text-sm italic text-equixity-deep">{eyebrow}</p>
        <h1 className="mt-3 max-w-2xl font-display text-4xl font-medium leading-tight text-ink sm:text-5xl">
          {title}
        </h1>
        {children && (
          <div className="mt-5 max-w-2xl text-[1.05rem] leading-relaxed text-slate">
            {children}
          </div>
        )}
      </Container>
    </section>
  );
}
