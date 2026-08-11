"use client";

import { Mono } from "@/components/ui/Mono";
import { cx } from "@/lib/utils/format";

/** The card every active stage renders inside. */
export function StageCard({
  step,
  title,
  lede,
  aside,
  children,
  tone = "plain",
}: {
  step: number;
  title: string;
  lede?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  tone?: "plain" | "fail";
}) {
  return (
    <section
      className={cx(
        "card animate-fade-up p-6 sm:p-8",
        tone === "fail" && "border-state-fail/40 bg-state-failSoft/30",
      )}
      aria-labelledby={`stage-${step}-title`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label">Stage {step} of 6</p>
          <h2 id={`stage-${step}-title`} className="mt-2 text-title font-semibold">
            {title}
          </h2>
        </div>
        {aside}
      </div>
      {lede ? (
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-muted text-pretty">{lede}</p>
      ) : null}
      <div className="mt-7">{children}</div>
    </section>
  );
}

/**
 * A finished stage, collapsed to one row that still shows its artifact — the
 * hash or tx a judge needs to see without scrolling back.
 */
export function StageSummary({
  step,
  title,
  artifacts,
}: {
  step: number;
  title: string;
  artifacts: Array<{ label: string; value: string; href?: string; mono?: boolean }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-line bg-surface-alt px-4 py-3">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-state-ok">
        <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
          <path
            d="M4 8.5 6.8 11 12 5.5"
            fill="none"
            stroke="#0B0B0D"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-[14px] font-medium">
        <span className="text-ink-faint tabular-nums">{step}. </span>
        {title}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {artifacts.map((a) => (
          <span key={a.label} className="inline-flex items-center gap-2">
            <span className="label">{a.label}</span>
            {a.mono === false ? (
              <span className="text-[13px] text-ink">{a.value}</span>
            ) : (
              <Mono value={a.value} label={a.label} href={a.href} />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export function FieldRow({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 border-b border-line py-3 last:border-0 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-baseline sm:gap-4">
      <span className="label pt-0.5">{label}</span>
      <div className="min-w-0">
        {children}
        {hint ? <p className="mt-1.5 text-[13px] leading-snug text-ink-faint">{hint}</p> : null}
      </div>
    </div>
  );
}
