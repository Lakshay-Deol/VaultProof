"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cx } from "@/lib/utils/format";

/**
 * The 12-step sequence, played rather than drawn.
 *
 * A static sequence diagram asks the reader to trace arrows. This plays the
 * protocol: one step at a time, with a packet travelling between the four
 * parties and the payload label changing as it moves. The point it has to land
 * is that steps 1–4 exist purely to remove us from the trust equation, so those
 * steps are pink and the run pauses on the "verified" beat.
 */

type Actor = "user" | "relay" | "chain" | "tee" | "exchange";

const ACTORS: Array<{ id: Actor; label: string; sub: string }> = [
  { id: "user", label: "Your browser", sub: "trusted by you" },
  { id: "relay", label: "Relay", sub: "assumed hostile" },
  { id: "chain", label: "Coston2", sub: "public record" },
  { id: "tee", label: "Enclave", sub: "AMD SEV" },
  { id: "exchange", label: "Exchange", sub: "read-only key" },
];

interface Step {
  n: number;
  from: Actor;
  to: Actor;
  payload: string;
  note: string;
  /** Part of the trust-establishing prologue. */
  prologue?: boolean;
  /** A read rather than a delivery. */
  read?: boolean;
  /** Work happening inside one party. */
  internal?: boolean;
}

const STEPS: Step[] = [
  {
    n: 1,
    from: "user",
    to: "tee",
    payload: "GET /quote",
    note: "Before anything else, the browser asks the enclave to identify itself.",
    prologue: true,
  },
  {
    n: 2,
    from: "tee",
    to: "user",
    payload: "quote + X25519 pubkey",
    note: "The key is inside the signed quote, not served next to it. That binding is the whole design.",
    prologue: true,
  },
  {
    n: 3,
    from: "user",
    to: "chain",
    payload: "isWhitelisted(measurement)",
    note: "The chain decides which build a lender trusts. Not us.",
    prologue: true,
    read: true,
  },
  {
    n: 4,
    from: "user",
    to: "user",
    payload: "verify → HPKE seal",
    note: "Both checks pass, so the browser seals the credential. Had either failed, it would refuse.",
    prologue: true,
    internal: true,
  },
  {
    n: 5,
    from: "user",
    to: "chain",
    payload: "submitRequest(keccak256)",
    note: "The hash goes on-chain. The ciphertext never does — publishing it would expose every past credential if the enclave key ever leaked.",
  },
  {
    n: 6,
    from: "user",
    to: "relay",
    payload: "opaque blob",
    note: "The relay carries something it cannot read. Compromising it gains an attacker nothing.",
  },
  {
    n: 7,
    from: "relay",
    to: "tee",
    payload: "forward, unread",
    note: "The enclave rejects any blob whose hash is not already in a confirmed on-chain event.",
  },
  {
    n: 8,
    from: "tee",
    to: "tee",
    payload: "unseal in memory",
    note: "First and only point where the plaintext credential exists.",
    internal: true,
  },
  {
    n: 9,
    from: "tee",
    to: "exchange",
    payload: "signed balance query",
    note: "The HMAC is built inside enclave memory over pinned TLS. 0.42 BTC, 3.1 ETH, $180.",
  },
  {
    n: 10,
    from: "tee",
    to: "chain",
    payload: "read FTSO feeds",
    note: "Priced with Flare's oracle, not the exchange's own valuation — otherwise a fake exchange could inflate its owner's worth.",
    read: true,
  },
  {
    n: 11,
    from: "tee",
    to: "tee",
    payload: "$58,371 → T3",
    note: "The amount is discarded. What survives is a tier, a nullifier and an expiry.",
    internal: true,
  },
  {
    n: 12,
    from: "tee",
    to: "chain",
    payload: "submitAttestation(T3)",
    note: "A lending contract reads the tier and extends the cap. Nothing else about the borrower was written anywhere.",
  },
];

const STEP_MS = 2600;

export function FlowPlayer() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [started, setStarted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  // Don't burn the run while the section is off screen — a reader who scrolls
  // down should arrive at step 1, not step 9.
  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setStarted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setStarted(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !started) return;
    timer.current = window.setTimeout(() => {
      setIndex((i) => (i + 1) % STEPS.length);
    }, STEP_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [index, playing, started]);

  const step = STEPS[index]!;
  const activeActors = new Set<Actor>([step.from, step.to]);

  const go = useCallback((next: number) => {
    setPlaying(false);
    setIndex(((next % STEPS.length) + STEPS.length) % STEPS.length);
  }, []);

  return (
    <figure ref={rootRef} className="my-9">
      <div className="overflow-hidden rounded-lg border border-line bg-surface-raised">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span
              className={cx(
                "inline-flex h-1.5 w-1.5 rounded-full",
                step.prologue ? "bg-flare" : "bg-state-ok",
              )}
            />
            <span className="label">
              {step.prologue ? "Establishing trust" : "Doing the work"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <PlayerButton label="Previous step" onClick={() => go(index - 1)}>
              <path d="M10 4 6 8l4 4" />
            </PlayerButton>
            <PlayerButton
              label={playing ? "Pause" : "Play"}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? <path d="M6.5 4v8M10 4v8" /> : <path d="M6 4l6 4-6 4z" />}
            </PlayerButton>
            <PlayerButton label="Next step" onClick={() => go(index + 1)}>
              <path d="M6 4l4 4-4 4" />
            </PlayerButton>
          </div>
        </div>

        {/* The lanes */}
        <div className="px-4 pb-2 pt-7 sm:px-6">
          <div className="relative">
            {/* Rail */}
            <div className="absolute left-0 right-0 top-[19px] h-px bg-line" />

            {/* The travelling packet */}
            <Packet step={step} />

            <ol className="relative grid grid-cols-5 gap-1">
              {ACTORS.map((actor) => {
                const active = activeActors.has(actor.id);
                return (
                  <li key={actor.id} className="flex flex-col items-center text-center">
                    <span
                      className={cx(
                        "relative z-10 flex h-[38px] w-[38px] items-center justify-center rounded-full border bg-surface transition-all duration-300",
                        active && step.prologue && "border-flare shadow-glow",
                        active && !step.prologue && "border-state-ok",
                        !active && "border-line",
                      )}
                    >
                      <ActorIcon
                        id={actor.id}
                        className={cx(
                          "h-[17px] w-[17px] transition-colors duration-300",
                          active
                            ? step.prologue
                              ? "text-flare-ink"
                              : "text-state-ok"
                            : "text-ink-faint",
                        )}
                      />
                    </span>
                    <span
                      className={cx(
                        "mt-2.5 text-[12px] font-medium leading-tight transition-colors duration-300 sm:text-[13px]",
                        active ? "text-ink" : "text-ink-faint",
                      )}
                    >
                      {actor.label}
                    </span>
                    <span className="mt-0.5 hidden text-[11px] leading-tight text-ink-faint sm:block">
                      {actor.sub}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* The commentary */}
        <div className="border-t border-line px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start gap-3.5">
            <span
              className={cx(
                "mt-[1px] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] tabular-nums transition-colors duration-300",
                step.prologue
                  ? "border-flare/50 bg-flare-soft text-flare-ink"
                  : "border-line bg-surface-sunk text-ink-muted",
              )}
            >
              {step.n}
            </span>
            <div className="min-w-0 flex-1">
              <p
                key={`p-${step.n}`}
                className={cx(
                  "animate-fade-up font-mono text-[13.5px] leading-snug",
                  step.prologue ? "text-flare-ink" : "text-ink",
                )}
              >
                {step.payload}
                {step.read ? <span className="ml-2 text-ink-faint">· read</span> : null}
              </p>
              <p
                key={`n-${step.n}`}
                className="mt-1.5 animate-fade-in text-[14px] leading-relaxed text-ink-muted"
              >
                {step.note}
              </p>
            </div>
          </div>

          {/* Progress ticks */}
          <ol className="mt-5 flex gap-1">
            {STEPS.map((s, i) => (
              <li key={s.n} className="flex-1">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Step ${s.n}: ${s.payload}`}
                  aria-current={i === index}
                  className="group block w-full py-1.5"
                >
                  <span
                    className={cx(
                      "block h-[3px] w-full rounded-full transition-all duration-300 group-hover:bg-line-strong",
                      i === index && (s.prologue ? "bg-flare" : "bg-state-ok"),
                      i !== index && i < index && "bg-line-strong",
                      i !== index && i > index && "bg-line",
                    )}
                  />
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <figcaption className="mt-3 text-[13px] leading-relaxed text-ink-muted">
        Steps 1–4 are pink because they exist only so you never have to trust us. Skip them
        and the encryption that follows is decorative.
      </figcaption>
    </figure>
  );
}

/**
 * The packet. Position is derived from the step's from/to lanes as a
 * percentage, and CSS transitions carry it across — so the movement is real
 * interpolation rather than a keyframe per step.
 */
function Packet({ step }: { step: Step }) {
  const laneCentre = (actor: Actor) => {
    const i = ACTORS.findIndex((a) => a.id === actor);
    return ((i + 0.5) / ACTORS.length) * 100;
  };

  const [at, setAt] = useState(() => laneCentre(step.from));

  useEffect(() => {
    // Snap to the origin without transition, then travel to the destination.
    setAt(laneCentre(step.from));
    const id = window.setTimeout(() => setAt(laneCentre(step.to)), 420);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.n]);

  return (
    <span
      aria-hidden="true"
      className={cx(
        "pointer-events-none absolute top-[19px] z-20 -ml-[5px] -mt-[5px] block h-2.5 w-2.5 rounded-full transition-all duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        step.prologue ? "bg-flare" : "bg-state-ok",
        step.internal && "opacity-0",
      )}
      style={{
        left: `${at}%`,
        boxShadow: step.prologue
          ? "0 0 0 4px rgba(230,32,88,0.18), 0 0 18px 2px rgba(230,32,88,0.55)"
          : "0 0 0 4px rgba(49,214,143,0.14), 0 0 18px 2px rgba(49,214,143,0.45)",
      }}
    />
  );
}

function PlayerButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

function ActorIcon({ id, className }: { id: Actor; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (id) {
    case "user": // browser window
      return (
        <svg {...common}>
          <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
          <path d="M2.5 7.5h15M5.5 5.5h.01M8 5.5h.01" />
        </svg>
      );
    case "relay": // pass-through arrows
      return (
        <svg {...common}>
          <path d="M3 7h11M11 4l3 3-3 3M17 13H6M9 16l-3-3 3-3" />
        </svg>
      );
    case "chain": // blocks
      return (
        <svg {...common}>
          <rect x="2.5" y="7.5" width="6" height="6" rx="1.5" />
          <rect x="11.5" y="7.5" width="6" height="6" rx="1.5" />
          <path d="M8.5 10.5h3" />
        </svg>
      );
    case "tee": // sealed chip
      return (
        <svg {...common}>
          <rect x="5" y="5" width="10" height="10" rx="2" />
          <path d="M8 2.5v2.5M12 2.5v2.5M8 15v2.5M12 15v2.5M2.5 8H5M2.5 12H5M15 8h2.5M15 12h2.5" />
        </svg>
      );
    case "exchange": // vault door
      return (
        <svg {...common}>
          <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
          <circle cx="10" cy="10" r="3" />
          <path d="M10 5v2M10 13v2" />
        </svg>
      );
  }
}
