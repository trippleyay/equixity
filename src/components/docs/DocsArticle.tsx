import { ReactNode } from "react";
import PageHero from "@/components/site/PageHero";
import Container from "@/components/site/Container";
import DocsNav from "./DocsNav";

/**
 * The shared shell for every docs page: the site's page hero on top, then the
 * navigation beside the article. The nav is sticky on large screens so a long
 * reference page can be navigated from anywhere in it.
 *
 * `min-w-0` on the article column is deliberate: docs pages contain <pre>
 * blocks that cannot wrap, and a grid child defaults to min-width:auto, which
 * would let one long line push the whole page wider than the viewport.
 */
export default function DocsArticle({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHero eyebrow="Docs" title={title}>
        {lede}
      </PageHero>

      <Container className="py-14 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <DocsNav />
          </div>
          <article className="min-w-0 max-w-3xl pb-8">{children}</article>
        </div>
      </Container>
    </>
  );
}
