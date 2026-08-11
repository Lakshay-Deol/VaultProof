"use client";

import { useEffect, useState } from "react";

import { prefersReducedMotion, useInView } from "@/lib/hooks/useInView";
import { cx, formatUsd } from "@/lib/utils/format";

/*
 * Formatting is named rather than a callback because the callers are Server
 * Components, and a function prop cannot cross the server/client boundary —
 * React has nothing to serialise it into.
 */
const FORMATTERS = {
  number: (n: number) => Math.round(n).toLocaleString("en-US"),
  usd: (n: number) => formatUsd(Math.round(n)),
} as const;

/**
 * A number that runs up to its value the first time it is scrolled into view.
 *
 * Driven by rAF against a wall-clock start rather than a fixed per-frame
 * increment, so a slow device lands on the same number at the same moment as a
 * fast one instead of finishing late. Reduced motion gets the final value with
 * no animation.
 *
 * `tabular-nums` is not optional here: proportional digits change width as they
 * change value and the surrounding layout jitters for the whole run.
 */
export function CountUp({
  to,
  duration = 1400,
  format = "number",
  suffix,
  className,
}: {
  to: number;
  duration?: number;
  format?: keyof typeof FORMATTERS;
  /** Appended after the formatted number, e.g. "h". */
  suffix?: string;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>({ threshold: 0.4 });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (prefersReducedMotion()) {
      setValue(to);
      return;
    }

    let frame = 0;
    const start = performance.now();
    // Decelerating: the number arrives rather than slamming to a stop.
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(to * ease(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, to, duration]);

  return (
    <span ref={ref} className={cx("tabular-nums", className)}>
      {FORMATTERS[format](inView ? value : 0)}
      {suffix}
    </span>
  );
}
