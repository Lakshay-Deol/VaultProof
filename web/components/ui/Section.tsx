import { cx } from "@/lib/utils/format";

export function Section({
  id,
  tone = "plain",
  className,
  children,
}: {
  id?: string;
  tone?: "plain" | "alt";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cx(
        "relative border-t border-line py-16 sm:py-24",
        tone === "alt" && "bg-surface-alt",
        className,
      )}
    >
      <div className="shell">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  className,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  className?: string;
}) {
  return (
    <header className={cx("max-w-2xl", className)}>
      {eyebrow ? <p className="label mb-3">{eyebrow}</p> : null}
      <h2 className="accent-underline text-display font-semibold">{title}</h2>
      {lede ? <p className="mt-6 text-lede text-ink-muted text-pretty">{lede}</p> : null}
    </header>
  );
}

export function Callout({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cx("callout", className)}>{children}</div>;
}
