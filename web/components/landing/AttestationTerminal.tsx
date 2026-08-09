"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  MOCK_MEASUREMENT,
  MOCK_NULLIFIER,
  DEMO_WALLET,
} from "@/lib/adapters/mock/fixtures";
import { cx, truncate } from "@/lib/utils/format";

/**
 * The attestation record as it actually lands on-chain, typed out line by line.
 * This is the whole output of the product, so the hero shows it rather than a
 * screenshot: five lines, and none of them is a balance.
 */
const lines: Array<{ key: string; value: string; tone?: "flare" | "ok" | "muted" }> = [
  { key: "wallet", value: DEMO_WALLET },
  { key: "tier", value: "T3  ($50k – $250k)", tone: "flare" },
  { key: "expires", value: "2026-08-10T14:22:04Z" },
  { key: "nullifier", value: truncate(MOCK_NULLIFIER, 10, 6) },
  { key: "measurement", value: truncate(MOCK_MEASUREMENT, 10, 6) },
  { key: "signature", value: "verified · attested enclave", tone: "ok" },
];

const DISCARDED = [
  "api key",
  "api secret",
  "exchange",
  "0.42 BTC, 3.1 ETH, $180",
  "exact total",
  "account id",
];

export function AttestationTerminal() {
  const [typed, setTyped] = useState(0);
  const [cycle, setCycle] = useState(0);
  const timer = useRef<number | null>(null);

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.key.length + l.value.length + 2, 0),
    [],
  );

  useEffect(() => {
    // One deliberate slow animation on the page. Types out, holds, restarts.
    const step = () => {
      setTyped((n) => {
        if (n >= total) {
          timer.current = window.setTimeout(() => {
            setTyped(0);
            setCycle((c) => c + 1);
          }, 4200);
          return n;
        }
        timer.current = window.setTimeout(step, 9);
        return n + 4;
      });
    };
    timer.current = window.setTimeout(step, 180);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [total, cycle]);

  let budget = typed;

  return (
    <div className="card overflow-hidden shadow-hover" aria-hidden="true">
      <div className="flex items-center gap-2 border-b border-line bg-surface-sunk px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-line-strong" />
        <span className="h-2 w-2 rounded-full bg-line-strong" />
        <span className="h-2 w-2 rounded-full bg-line-strong" />
        <span className="ml-1.5 font-mono text-[11px] tracking-tight text-ink-muted">
          SolvencyRegistry.Attested
        </span>
      </div>

      <div className="space-y-2 px-4 py-6 font-mono text-[12.5px] sm:px-5 sm:text-[13px]">
        {lines.map((line) => {
          const keyChars = Math.max(0, Math.min(line.key.length, budget));
          budget -= line.key.length;
          const valChars = Math.max(0, Math.min(line.value.length, budget));
          budget -= line.value.length + 2;
          const active = keyChars > 0;

          return (
            // Fixed row height: the card must not grow as text arrives, or the
            // hero shifts under the reader on every cycle.
            <div key={line.key} className="flex h-[22px] items-center gap-x-2 overflow-hidden">
              <span className="w-[86px] shrink-0 text-ink-faint sm:w-[92px]">
                {line.key.slice(0, keyChars)}
              </span>
              <span
                className={cx(
                  "min-w-0 truncate",
                  line.tone === "flare"
                    ? "font-medium text-flare-ink"
                    : line.tone === "ok"
                      ? "text-state-ok"
                      : "text-ink",
                )}
              >
                {line.value.slice(0, valChars)}
                {active && valChars < line.value.length ? (
                  <span className="ml-px inline-block h-[1em] w-[6px] animate-caret bg-flare align-text-bottom" />
                ) : null}
              </span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line bg-surface-sunk px-4 py-3.5 sm:px-5">
        <p className="label mb-2">Destroyed inside the enclave</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 font-mono text-[12px] text-ink-faint">
          {DISCARDED.map((item) => (
            <span key={item} className="line-through decoration-state-fail/50">
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
