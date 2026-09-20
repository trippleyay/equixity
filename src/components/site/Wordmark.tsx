/**
 * The source wordmark artwork is a solid white path, built for dark or
 * colored backgrounds. public/equixity-wordmark-dark.svg is the same path
 * with the fill swapped to the brand purple, for anywhere the logo sits on
 * white or the light mist background. Pick the variant that matches what's
 * behind it rather than always reaching for one file.
 */
export default function Wordmark({
  variant = "dark",
  className = "h-6 w-auto",
}: {
  variant?: "light" | "dark";
  className?: string;
}) {
  const src =
    variant === "light"
      ? "/equixity-wordmark-light.svg"
      : "/equixity-wordmark-dark.svg";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="Equixity" className={className} />
  );
}
