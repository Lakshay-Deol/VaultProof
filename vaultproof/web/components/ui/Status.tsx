import { cx } from "@/lib/utils/format";

export type Mark = "idle" | "running" | "pass" | "fail";

/**
 * The spinner→tick transition used by every check and every enclave step.
 * One component so the timing and weight are identical everywhere.
 */
export function StatusMark({ state, className }: { state: Mark; className?: string }) {
  if (state === "running") {
    return (
      <span
        className={cx("relative inline-flex h-4 w-4 shrink-0", className)}
        role="status"
        aria-label="running"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4 animate-spin" style={{ animationDuration: "800ms" }}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="#26262C" strokeWidth="2" />
          <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="#FF6E92" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  if (state === "pass") {
    return (
      <span
        className={cx(
          "inline-flex h-4 w-4 shrink-0 animate-fade-in items-center justify-center rounded-full bg-state-ok",
          className,
        )}
        aria-label="passed"
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3">
          <path d="M4 8.5 6.8 11 12 5.5" fill="none" stroke="#0B0B0D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  if (state === "fail") {
    return (
      <span
        className={cx(
          "inline-flex h-4 w-4 shrink-0 animate-fade-in items-center justify-center rounded-full bg-state-fail",
          className,
        )}
        aria-label="failed"
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3">
          <path d="M5 5l6 6M11 5l-6 6" fill="none" stroke="#0B0B0D" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={cx("inline-flex h-4 w-4 shrink-0 items-center justify-center", className)}
      aria-label="waiting"
    >
      <span className="h-[7px] w-[7px] rounded-full border border-line-strong" />
    </span>
  );
}

/** A one-line indeterminate progress bar, used under running steps. */
export function Sweep({ className }: { className?: string }) {
  return (
    <span className={cx("relative block h-[2px] w-full overflow-hidden bg-line", className)}>
      <span className="absolute inset-y-0 left-0 w-1/3 animate-sweep bg-flare" />
    </span>
  );
}
