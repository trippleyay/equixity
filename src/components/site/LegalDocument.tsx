export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  notice?: string;
};

export default function LegalDocument({
  sections,
}: {
  sections: LegalSection[];
}) {
  return (
    <div className="mx-auto max-w-prose py-16 sm:py-20">
      <div className="mb-14 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm leading-relaxed text-slate">
        <p className="font-semibold text-ink">Draft for legal review</p>
        <p className="mt-1">
          This first draft must be reviewed and approved by qualified counsel
          before Equixity relies on it or launches the service. Bracketed
          drafting notes are not operative terms.
        </p>
      </div>

      <div className="space-y-14">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-display text-2xl font-semibold text-ink">
              {section.heading}
            </h2>
            {section.paragraphs?.map((paragraph) => (
              <p
                key={paragraph}
                className="mt-4 text-[1.05rem] leading-relaxed text-slate"
              >
                {paragraph}
              </p>
            ))}
            {section.bullets ? (
              <ul className="mt-5 list-disc space-y-3 pl-6 text-[1.05rem] leading-relaxed text-slate marker:text-equixity-deep">
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {section.notice ? (
              <p className="mt-5 border-l-4 border-equixity bg-equixity/5 px-5 py-4 text-[1.05rem] leading-relaxed text-slate">
                {section.notice}
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
