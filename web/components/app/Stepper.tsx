"use client";

import { STAGES, transitions, usePipeline } from "@/lib/store/pipeline";
import { cx } from "@/lib/utils/format";

/**
 * Left rail on desktop, horizontal dots under 768px. The stepper is the one
 * place with a deliberately slow animation: the connector line between a done
 * stage and the active one fills over 600ms.
 */
export function Stepper() {
  const status = usePipeline((s) => s.status);
  const wallet = usePipeline((s) => s.wallet);
  const failedStage = usePipeline((s) => s.failedStage);

  const states = STAGES.map((stage) => ({
    ...stage,
    state: transitions.stageState(stage.id, status, wallet, failedStage),
  }));

  return (
    <>
      {/* Mobile: horizontal dots */}
      {/* Bleeds to the shell's gutter, so the negative margin has to track it. */}
      <ol className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 md:hidden">
        {states.map((s) => (
          <li key={s.id} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span
              className={cx(
                "h-[3px] w-full rounded-full transition-colors duration-500",
                s.state === "done" && "bg-state-ok",
                s.state === "active" && "bg-flare",
                s.state === "failed" && "bg-state-fail",
                s.state === "todo" && "bg-line",
              )}
            />
            <span
              className={cx(
                "truncate text-[11px] leading-tight",
                s.state === "active" ? "font-medium text-ink" : "text-ink-faint",
              )}
            >
              {s.title}
            </span>
          </li>
        ))}
      </ol>

      {/* Desktop: vertical rail */}
      <ol className="hidden md:block">
        {states.map((s, i) => (
          <li key={s.id} className="relative flex gap-4 pb-7 last:pb-0">
            {i < states.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-line"
              >
                <span
                  className={cx(
                    "block w-px origin-top bg-state-ok transition-transform duration-[600ms] ease-out",
                    s.state === "done" ? "h-full scale-y-100" : "h-full scale-y-0",
                  )}
                />
              </span>
            ) : null}

            <span
              className={cx(
                "relative z-10 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border text-[12px] font-medium tabular-nums transition-colors duration-200",
                s.state === "done" && "border-state-ok bg-state-ok text-surface",
                s.state === "active" && "animate-pulse-ring border-flare bg-flare text-white",
                s.state === "failed" && "border-state-fail bg-state-fail text-surface",
                s.state === "todo" && "border-line bg-surface text-ink-faint",
              )}
            >
              {s.state === "done" ? (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                  <path
                    d="M4 8.5 6.8 11 12 5.5"
                    fill="none"
                    stroke="#0B0B0D"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                s.index
              )}
            </span>

            <div className="min-w-0 pt-[3px]">
              <p
                className={cx(
                  "text-[14px] font-medium leading-tight transition-colors",
                  s.state === "todo" ? "text-ink-faint" : "text-ink",
                )}
              >
                {s.title}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-ink-faint">{s.blurb}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
