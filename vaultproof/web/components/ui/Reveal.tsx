"use client";

import { useInView } from "@/lib/hooks/useInView";
import { cx } from "@/lib/utils/format";

/**
 * Fade-and-lift on entry, once.
 *
 * The initial hidden state is a CSS class (see globals.css) rather than
 * inline style, so it is painted with the first frame — nothing flashes in
 * at full opacity and then jumps.
 */
const variants = {
  up: "",
  scale: "reveal-scale",
  right: "reveal-right",
  left: "reveal-left",
} as const;

export function Reveal({
  children,
  delay = 0,
  variant = "up",
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  /** Milliseconds. Use small offsets to stagger siblings; keep under ~250ms. */
  delay?: number;
  /** Where the element travels from. `up` is the default everywhere. */
  variant?: keyof typeof variants;
  className?: string;
  as?: "div" | "section" | "li" | "article" | "header";
}) {
  const { ref, inView } = useInView<HTMLElement>();

  return (
    <Tag
      ref={ref as never}
      className={cx("reveal", !inView && variants[variant], inView && "reveal-in", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
