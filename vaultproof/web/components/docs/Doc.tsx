import { cx } from "@/lib/utils/format";

/** Flare-docs prose column: narrow, generous leading, thin rules. */
export function DocSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line pt-10">
      <h2 className="accent-underline text-title font-semibold">{title}</h2>
      <div className="mt-6 space-y-4 text-[16px] leading-[1.7] text-ink">{children}</div>
    </section>
  );
}

export function DocCallout({
  title,
  tone = "flare",
  children,
}: {
  title?: string;
  tone?: "flare" | "fail";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "border-l-2 py-4 pl-5 pr-4",
        tone === "flare" ? "border-flare bg-flare-soft/40" : "border-state-fail bg-state-failSoft/50",
      )}
    >
      {title ? (
        <p
          className={cx(
            "mb-2 text-[14px] font-medium",
            tone === "flare" ? "text-flare-ink" : "text-state-fail",
          )}
        >
          {title}
        </p>
      ) : null}
      <div className="space-y-2 text-[15px] leading-relaxed text-ink">{children}</div>
    </div>
  );
}

export function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded border border-line bg-surface-alt">
      {label ? (
        <div className="border-b border-line px-4 py-2">
          <span className="label">{label}</span>
        </div>
      ) : null}
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-relaxed text-ink">
        {children}
      </pre>
    </div>
  );
}

/** On-page nav, mirroring dev.flare.network's right-hand "On this page". */
export function DocToc({ items }: { items: Array<{ id: string; label: string }> }) {
  return (
    <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
      <p className="label mb-3">On this page</p>
      <ul className="space-y-2 border-l border-line">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="-ml-px block border-l border-transparent pl-4 text-[13.5px] leading-snug text-ink-muted transition-colors hover:border-flare hover:text-ink"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
