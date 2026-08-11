import { cx } from "@/lib/utils/format";

/**
 * Seamless horizontal ticker.
 *
 * The children are rendered twice into one flex track; the CSS animation
 * translates the track by exactly -50%, which puts copy two where copy one
 * started, so the loop has no visible seam. Duration is passed as a custom
 * property rather than a class because it depends on content width — a short
 * strip at 42s crawls, a long one at 42s sprints.
 *
 * Duplicated content is hidden from assistive tech; the first copy carries the
 * real text.
 */
export function Marquee({
  children,
  /** Seconds for one full pass. Scale it with how much content you pass. */
  duration = 42,
  reverse = false,
  className,
}: {
  children: React.ReactNode;
  duration?: number;
  reverse?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("marquee-mask", className)}>
      <div
        className="marquee-track"
        style={{
          ["--marquee-duration" as string]: `${duration}s`,
          animationDirection: reverse ? "reverse" : undefined,
        }}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
