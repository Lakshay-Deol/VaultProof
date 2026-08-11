"use client";

import { useEffect, useState } from "react";

import { prefersReducedMotion, useInView } from "@/lib/hooks/useInView";
import { STAGES } from "@/lib/store/pipeline";
import { cx } from "@/lib/utils/format";

/**
 * The six pipeline stages as one rail, cycling on a timer.
 *
 * It reads the same `STAGES` table the real app stepper reads, so the landing
 * page cannot drift from the product: rename a stage once and both change.
 *
 * The cycle starts only when the strip is scrolled into view, and stops while
 * the tab is backgrounded — a five-second loop running in a hidden tab is pure
 * battery. Under reduced motion the rail is drawn complete with every stage lit
 * and nothing moves, which still communicates the sequence.
 */
const STEP_MS = 1600;

export function PipelineStrip() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.25 });
  const [active, setActive] = useState(0);
  /* Read after mount, not during render: the server has no matchMedia, so
     deriving this inline would make the first client render disagree with the
     HTML and React would throw away the tree. */
  const [reduced, setReduced] = useState(false);

  useEffect(() => setReduced(prefersReducedMotion()), []);

  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;

    const id = window.setInterval(() => {
      if (document.hidden) return;
      setActive((n) => (n + 1) % STAGES.length);
    }, STEP_MS);

    return () => window.clearInterval(id);
  }, [inView]);

  // Reduced motion shows the finished state rather than a frozen first frame.
  const activeIndex = reduced ? STAGES.length - 1 : active;
  const progress = activeIndex / (STAGES.length - 1);

  return (
    <div ref={ref} className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="relative min-w-[680px] pt-8">
        {/* Rail. The dim full-width track, the lit portion, and one packet
            travelling over the top of both. */}
        <div className="absolute inset-x-0 top-[13px] h-px bg-line" aria-hidden="true">
          <div
            className="h-px origin-left bg-gradient-to-r from-flare to-flare-ember transition-transform duration-700 ease-out"
            style={{ transform: `scaleX(${progress})` }}
          />
          {!reduced ? (
            <div className="absolute inset-0 overflow-hidden">
              <div className="h-px w-16 animate-travel bg-gradient-to-r from-transparent via-flare-ink to-transparent" />
            </div>
          ) : null}
        </div>

        <ol className="relative grid grid-cols-6 gap-4">
          {STAGES.map((stage, i) => {
            const done = i < activeIndex;
            const current = i === activeIndex;

            return (
              <li key={stage.id} className="min-w-0">
                <span
                  className={cx(
                    "relative -mt-[21px] flex h-[17px] w-[17px] items-center justify-center rounded-full border transition-colors duration-500",
                    done && "border-flare bg-flare",
                    current && "border-flare bg-flare shadow-glow",
                    !done && !current && "border-line bg-surface",
                  )}
                  aria-hidden="true"
                >
                  {current && !reduced ? (
                    <span className="absolute inset-0 animate-ping rounded-full bg-flare" />
                  ) : null}
                  <span
                    className={cx(
                      "h-[5px] w-[5px] rounded-full transition-colors duration-500",
                      done || current ? "bg-surface" : "bg-line-strong",
                    )}
                  />
                </span>

                <p
                  className={cx(
                    "mt-4 text-[13.5px] font-medium leading-tight transition-colors duration-500",
                    current ? "text-ink" : done ? "text-ink-muted" : "text-ink-faint",
                  )}
                >
                  <span className="mr-1.5 font-mono text-[11px] text-ink-faint tabular-nums">
                    {String(stage.index).padStart(2, "0")}
                  </span>
                  {stage.title}
                </p>
                <p
                  className={cx(
                    "mt-1.5 text-[12.5px] leading-snug transition-colors duration-500",
                    current ? "text-ink-muted" : "text-ink-faint/70",
                  )}
                >
                  {stage.blurb}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
