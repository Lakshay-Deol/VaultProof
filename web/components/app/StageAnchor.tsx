"use client";

import { useCallback, useEffect, useRef } from "react";

import { StageCard } from "@/components/app/StageShell";
import { Button } from "@/components/ui/Button";
import { Mono } from "@/components/ui/Mono";
import { StatusMark, Sweep } from "@/components/ui/Status";
import { getChainClient, getEnclaveClient } from "@/lib/adapters";
import { ADDRESSES } from "@/lib/config/addresses";
import { explorerTx } from "@/lib/config/chain";
import { IS_MOCK } from "@/lib/config/mode";
import { usePipeline } from "@/lib/store/pipeline";
import { takeSealedBlob } from "@/lib/store/sealed";

/**
 * Stage 4. Hash first, ciphertext second.
 *
 * Ordering is the whole point: putting the ciphertext in calldata would publish
 * it permanently, so a future compromise of the enclave key would retroactively
 * expose every credential ever submitted (spec §5).
 */
export function StageAnchor() {
  const seal = usePipeline((s) => s.seal);
  const anchorTxHash = usePipeline((s) => s.anchorTxHash);
  const requestId = usePipeline((s) => s.requestId);
  const failure = usePipeline((s) => s.failure);
  const failedStage = usePipeline((s) => s.failedStage);
  const status = usePipeline((s) => s.status);

  const setAnchorTx = usePipeline((s) => s.setAnchorTx);
  const setRequestId = usePipeline((s) => s.setRequestId);
  const startProcessing = usePipeline((s) => s.startProcessing);
  const fail = usePipeline((s) => s.fail);
  const resetFrom = usePipeline((s) => s.resetFrom);

  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current || !seal) return;
    running.current = true;
    try {
      const { txHash } = await getChainClient().submitRequestHash(seal.requestHash);
      setAnchorTx(txHash);

      const blob = takeSealedBlob();
      if (!blob) throw new Error("sealed blob is no longer in memory");

      const response = await getEnclaveClient().submitSealed(blob, txHash);
      if (!response.accepted) throw new Error("the enclave rejected the request");
      setRequestId(response.requestId);
      startProcessing();
    } catch (err) {
      fail("anchor", err instanceof Error ? err.message : "Anchoring failed.");
    } finally {
      running.current = false;
    }
  }, [seal, setAnchorTx, setRequestId, startProcessing, fail]);

  useEffect(() => {
    if (status === "anchoring" && !anchorTxHash) void run();
  }, [status, anchorTxHash, run]);

  const stopped = status === "failed" && failedStage === "anchor";

  return (
    <StageCard
      step={4}
      title="Anchor the request"
      lede="The hash goes on-chain, the ciphertext does not — so a future key compromise can't retroactively expose past credentials."
      tone={stopped ? "fail" : "plain"}
    >
      <ol className="divide-y divide-line border-y border-line">
        <li className="py-4">
          <div className="flex gap-3">
            <StatusMark state="pass" className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium">keccak256 of the sealed blob</p>
              <div className="mt-1.5">
                {seal ? (
                  <Mono value={seal.requestHash} label="Request hash" head={14} tail={10} />
                ) : null}
              </div>
            </div>
          </div>
        </li>

        <li className="py-4">
          <div className="flex gap-3">
            <StatusMark
              state={stopped && !anchorTxHash ? "fail" : anchorTxHash ? "pass" : "running"}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium">
                submitRequest on InstructionSender
              </p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
                The only address the TeeExtensionRegistry accepts instructions from for this
                extension.
              </p>
              {anchorTxHash ? (
                <div className="mt-2 animate-fade-in">
                  <Mono
                    value={anchorTxHash}
                    label="Anchor transaction"
                    head={14}
                    tail={10}
                    href={IS_MOCK ? undefined : explorerTx(anchorTxHash)}
                  />
                  {IS_MOCK ? (
                    <span className="ml-2 text-[12px] uppercase tracking-[0.08em] text-ink-faint">
                      mock tx
                    </span>
                  ) : null}
                </div>
              ) : (
                <Sweep className="mt-3" />
              )}
            </div>
          </div>
        </li>

        <li className="py-4">
          <div className="flex gap-3">
            <StatusMark
              state={stopped && anchorTxHash ? "fail" : requestId ? "pass" : anchorTxHash ? "running" : "idle"}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium">Ciphertext delivered to the relay</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
                The relay forwards an opaque blob it cannot read. The enclave refuses any blob
                whose hash is not in a confirmed on-chain event, and any nonce it has seen
                before.
              </p>
              {requestId ? (
                <p className="mt-2 animate-fade-in font-mono text-[13px] text-state-ok">
                  accepted · {requestId}
                </p>
              ) : anchorTxHash ? (
                <Sweep className="mt-3" />
              ) : null}
            </div>
          </div>
        </li>
      </ol>

      <p className="mt-5 text-[13.5px] leading-relaxed text-ink-faint">
        Anchoring costs gas, which means every action the enclave takes has a paid-for,
        ordered, tamper-evident public footprint — without publishing anything about you.
      </p>

      {stopped ? (
        <div className="mt-6 rounded border border-state-fail bg-state-failSoft px-5 py-4">
          <p className="text-[15px] font-medium text-state-fail">Anchoring failed.</p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">{failure}</p>
          <Button variant="ghost" size="sm" className="mt-4" onClick={() => resetFrom("seal")}>
            Start over from sealing
          </Button>
        </div>
      ) : null}

      <p className="mt-3 text-[12.5px] text-ink-faint">
        Contract: <Mono value={ADDRESSES.instructionSender} label="InstructionSender" />
      </p>
    </StageCard>
  );
}
