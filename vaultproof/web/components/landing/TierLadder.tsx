"use client";

import { TierBadge } from "@/components/ui/Badge";
import { useInView } from "@/lib/hooks/useInView";
import { MOCK_TIER } from "@/lib/adapters/mock/fixtures";
import { TIERS } from "@/lib/config/tiers";
import { cx } from "@/lib/utils/format";

/**
 * The tier table as a set of bars that draw themselves out on scroll.
 *
 * The bars are scaled against the top cap on a square-root curve, not linearly:
 * T4 is 75x T1, and a linear scale renders the first three tiers as invisible
 * slivers. The printed cap beside each bar carries the exact number, so the bar
 * only has to convey order of magnitude.
 *
 * The whole point of the section is what is *missing*: the lender sees which
 * band you are in, and nothing about where inside it you sit.
 */
const TOP_CAP = TIERS[TIERS.length - 1]!.cap;

export function TierLadder() {
  const { ref, inView } = useInView<HTMLUListElement>({ threshold: 0.2 });

  return (
    <ul ref={ref} className="space-y-2.5">
      {TIERS.map((tier, i) => {
        const share = tier.cap === 0 ? 0 : Math.sqrt(tier.cap / TOP_CAP);
        const highlight = tier.id === MOCK_TIER.id;

        return (
          <li
            key={tier.name}
            className={cx(
              "card card-lit flex items-center gap-4 px-4 py-3.5 transition-colors duration-300",
              highlight ? "border-flare-border bg-flare-soft" : "hover:border-line-strong",
            )}
          >
            <TierBadge tier={tier.id} className="shrink-0" />

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-[14px] text-ink-muted">{tier.range}</p>
                <p
                  className={cx(
                    "shrink-0 font-mono text-[13px] tabular-nums",
                    highlight ? "text-flare-ink" : "text-ink",
                  )}
                >
                  {tier.capLabel}
                </p>
              </div>

              {/* Track plus fill. Transform-only, and the stagger is a delay on
                  the transition rather than six separate animations. */}
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunk">
                <div
                  className={cx(
                    "h-full origin-left rounded-full transition-transform duration-[900ms] ease-out",
                    highlight
                      ? "bg-gradient-to-r from-flare to-flare-ember"
                      : "bg-line-strong",
                  )}
                  style={{
                    transform: `scaleX(${inView ? share : 0})`,
                    transitionDelay: `${i * 90}ms`,
                  }}
                />
              </div>
            </div>

            {highlight ? (
              <span className="hidden shrink-0 items-center gap-1.5 text-[12px] text-flare-ink xs:inline-flex">
                <span className="live-dot bg-flare after:bg-flare" />
                worked example
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
