"use client";

import { useCallback, useEffect, useRef } from "react";

import { StageCard } from "@/components/app/StageShell";
import { Badge, TierBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatusMark, Sweep } from "@/components/ui/Status";
import { getChainClient, getEnclaveClient } from "@/lib/adapters";
import {
  MOCK_LINE_ITEMS,
  MOCK_TIER,
  MOCK_TOTAL_USD,
} from "@/lib/adapters/mock/fixtures";
import type { EnclaveStepId } from "@/lib/adapters/types";
import { usePipeline } from "@/lib/store/pipeline";
import { cx, formatUsd } from "@/lib/utils/format";
import { dropSealed } from "@/lib/store/sealed";

const STEPS: Array<{ id: EnclaveStepId; title: string; sub: string }> = [
  { id: "unseal", title: "Unseal the credential", sub: "First and only point where plaintext exists." },
  { id: "query", title: "Query the exchange", sub: "HMAC built in enclave memory. TLS pinned in the build." },
  { id: "price", title: "Price via FTSO", sub: "Flare's own feeds, not the exchange's valuation." },
  { id: "reduce", title: "Reduce to tier and nullifier", sub: "Everything specific is discarded here." },
  { id: "sign", title: "Sign and wipe", sub: "TEE signing port. Buffers zeroized before returning." },
];

/**
 * Stage 5. The enclave's five steps, mirrored live.
 *
 * The reduce step is the one that matters: the dollar figure the FTSO step just
 * computed visibly dissolves and is replaced by a tier. Reduction is the
 * privacy product, so it gets an animation rather than a sentence.
 */
export function StageProcessing() {
  const requestId = usePipeline((s) => s.requestId);
  const wallet = usePipeline((s) => s.wallet);
  const steps = usePipeline((s) => s.enclaveSteps);
  const notes = usePipeline((s) => s.enclaveNotes);
  const status = usePipeline((s) => s.status);
  const failure = usePipeline((s) => s.failure);
  const failedStage = usePipeline((s) => s.failedStage);

  const setEnclaveStep = usePipeline((s) => s.setEnclaveStep);
  const setAttestation = usePipeline((s) => s.setAttestation);
  const fail = usePipeline((s) => s.fail);
  const resetFrom = usePipeline((s) => s.resetFrom);

  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current || !requestId || !wallet) return;
    running.current = true;
    try {
      await getEnclaveClient().watchProcessing(requestId, (event) => {
        setEnclaveStep(event.step, event.status, event.detail);
      });
      // The credential is gone from the enclave; drop our copy of the
      // ciphertext too, so nothing about this request survives the request.
      dropSealed();
      const record = await getChainClient().watchAttestation(wallet);
      setAttestation(record);
    } catch (err) {
      fail("processing", err instanceof Error ? err.message : "The enclave returned an error.");
    } finally {
      running.current = false;
    }
  }, [requestId, wallet, setEnclaveStep, setAttestation, fail]);

  useEffect(() => {
    if (status === "processing") void run();
  }, [status, run]);

  const stopped = status === "failed" && failedStage === "processing";
  const priced = steps.price === "done";
  const reducing = steps.reduce === "running" || steps.reduce === "done";
  const reduced = steps.reduce === "done";

  return (
    <StageCard
      step={5}
      title="Inside the enclave"
      lede="Five steps run in a confidential VM whose memory the host cannot read. This is the only place where both halves of the secret exist at once."
      tone={stopped ? "fail" : "plain"}
      aside={<Badge tone="pending">Confidential Space</Badge>}
    >
      <ol className="divide-y divide-line border-y border-line">
        {STEPS.map((step, i) => {
          const state = steps[step.id];
          return (
            <li key={step.id} className="py-4">
              <div className="flex gap-3">
                <StatusMark
                  state={
                    stopped && state === "running"
                      ? "fail"
                      : state === "done"
                        ? "pass"
                        : state === "running"
                          ? "running"
                          : "idle"
                  }
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cx(
                      "text-[15px] font-medium leading-snug",
                      state === "idle" && "text-ink-faint",
                    )}
                  >
                    <span className="text-ink-faint tabular-nums">{i + 1}. </span>
                    {step.title}
                  </p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">{step.sub}</p>

                  {state === "running" ? <Sweep className="mt-3" /> : null}
                  {state === "done" && notes[step.id] ? (
                    <p className="mt-2 animate-fade-in text-[13.5px] text-state-ok">
                      {notes[step.id]}
                    </p>
                  ) : null}

                  {step.id === "price" && (state === "running" || state === "done") ? (
                    <FtsoMath />
                  ) : null}

                  {step.id === "reduce" && reducing ? (
                    <Reduction dissolved={reduced} enabled={priced} />
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {stopped ? (
        <div className="mt-6 rounded border border-state-fail bg-state-failSoft px-5 py-4">
          <p className="text-[15px] font-medium text-state-fail">The enclave returned an error.</p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">{failure}</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
            Errors from the enclave never carry a credential-derived value. That is why this
            message is vague — deliberately.
          </p>
          <Button variant="ghost" size="sm" className="mt-4" onClick={() => resetFrom("seal")}>
            Start over from sealing
          </Button>
        </div>
      ) : null}
    </StageCard>
  );
}

/** The actual arithmetic from spec §5, step 10. */
function FtsoMath() {
  return (
    <div className="mt-3 animate-fade-up overflow-hidden rounded border border-line bg-surface-alt">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <p className="label">FTSO feeds · Coston2</p>
        <Badge tone="flare">On-chain prices</Badge>
      </div>
      <table className="w-full border-collapse font-mono text-[13px]">
        <tbody>
          {MOCK_LINE_ITEMS.map((line) => (
            <tr key={line.asset} className="border-b border-line last:border-0">
              <td className="py-2 pl-4 pr-3 text-ink-muted">{line.feed}</td>
              <td className="py-2 pr-3 tabular-nums">
                {line.asset === "USD"
                  ? "cash balance"
                  : `${line.amount} ${line.asset} × ${formatUsd(line.price)}`}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatUsd(line.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t border-line bg-surface px-4 py-2.5 font-mono text-[13px]">
        <span className="text-ink-muted">total</span>
        <span className="font-medium tabular-nums">{formatUsd(MOCK_TOTAL_USD)}</span>
      </div>
    </div>
  );
}

/**
 * The dollar figure blurs away and a tier takes its place. Held long enough to
 * read on a screen recording without the viewer having to scrub back.
 */
function Reduction({ dissolved, enabled }: { dissolved: boolean; enabled: boolean }) {
  if (!enabled) return null;
  return (
    <div className="mt-3 animate-fade-up rounded border border-line bg-surface-alt px-4 py-5">
      <div className="flex items-center justify-center gap-6 sm:gap-10">
        <div className="text-center">
          <p className="label mb-2">Computed</p>
          <p
            className={cx(
              "font-mono text-[26px] font-medium tabular-nums tracking-tight sm:text-[32px]",
              dissolved ? "animate-dissolve text-ink" : "text-ink",
            )}
          >
            {formatUsd(MOCK_TOTAL_USD)}
          </p>
        </div>

        <svg viewBox="0 0 40 24" className="h-5 w-10 shrink-0 text-ink-faint" aria-hidden="true">
          <path d="M2 12h32M28 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <div className="text-center">
          <p className="label mb-2">Published</p>
          {dissolved ? (
            <div className="animate-tier-in">
              <TierBadge tier={MOCK_TIER.id} size="lg" />
            </div>
          ) : (
            <div className="flex h-[46px] items-center justify-center">
              <span className="font-mono text-[26px] text-ink-faint sm:text-[32px]">…</span>
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-[13.5px] leading-relaxed text-ink-muted">
        {dissolved
          ? `${MOCK_TIER.name} is about 2.5 bits. The exact total was a fingerprint — unique, linkable, and permanent once on a public ledger.`
          : "Discarding the amount…"}
      </p>
    </div>
  );
}
