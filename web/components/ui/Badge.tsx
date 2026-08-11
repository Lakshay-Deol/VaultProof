import { cx } from "@/lib/utils/format";

type Tone = "neutral" | "ok" | "pending" | "fail" | "flare";

const tones: Record<Tone, string> = {
  neutral: "border-line bg-surface-sunk text-ink-muted",
  ok: "border-state-ok/30 bg-state-okSoft text-state-ok",
  pending: "border-state-pending/30 bg-state-pendingSoft text-state-pending",
  fail: "border-state-fail/30 bg-state-failSoft text-state-fail",
  flare: "border-flare-border bg-flare-soft text-flare-ink",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded border px-2 py-[3px] text-[11px] font-medium uppercase tracking-[0.08em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** T0 → T4 on a subtle gray-to-pink scale. */
const tierStyles: Record<number, string> = {
  0: "border-line bg-surface-sunk text-ink-faint",
  1: "border-line-strong bg-surface-sunk text-ink-muted",
  2: "border-flare-border/60 bg-flare-soft/40 text-ink",
  3: "border-flare-border bg-flare-soft text-flare-ink",
  4: "border-flare bg-flare text-white",
};

export function TierBadge({
  tier,
  size = "sm",
  className,
}: {
  tier: number;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center justify-center rounded border font-mono font-medium tabular-nums",
        tierStyles[tier] ?? tierStyles[0],
        size === "lg" ? "px-4 py-1.5 text-[28px] tracking-tight" : "px-2 py-[3px] text-[12px]",
        className,
      )}
    >
      T{tier}
    </span>
  );
}
