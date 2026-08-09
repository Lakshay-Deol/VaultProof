"use client";

import { useEffect } from "react";

import { StageAnchor } from "@/components/app/StageAnchor";
import { StageAttested } from "@/components/app/StageAttested";
import { StageConnect } from "@/components/app/StageConnect";
import { StageProcessing } from "@/components/app/StageProcessing";
import { StageSeal } from "@/components/app/StageSeal";
import { StageSummary } from "@/components/app/StageShell";
import { StageVerify } from "@/components/app/StageVerify";
import { Stepper } from "@/components/app/Stepper";
import { bindMockWallet } from "@/lib/adapters/mock/chain";
import { explorerTx } from "@/lib/config/chain";
import { IS_MOCK } from "@/lib/config/mode";
import { transitions, usePipeline, type PipelineStatus } from "@/lib/store/pipeline";

/**
 * The guided pipeline.
 *
 * Stages render from `status`, not from a route or a local step counter. That
 * is what makes the security gate structural: `StageSeal` is not mounted at all
 * until the store says verification passed, so there is no DOM to prise open
 * and no handler to call early.
 */
const STATUS_ANNOUNCEMENTS: Record<PipelineStatus, string> = {
  idle: "Stage 1 of 6. Connect a wallet.",
  verifying: "Stage 2 of 6. Verifying the enclave attestation.",
  verified: "Enclave verified. Stage 3 of 6, seal the credential.",
  sealing: "Sealing the credential in your browser.",
  anchoring: "Stage 4 of 6. Anchoring the request hash on Coston2.",
  processing: "Stage 5 of 6. The enclave is processing the request.",
  attested: "Stage 6 of 6. Attested. You can now borrow against the tier.",
  failed: "The pipeline stopped. Nothing was encrypted and nothing was sent.",
};

export function Pipeline() {
  const status = usePipeline((s) => s.status);
  const wallet = usePipeline((s) => s.wallet);
  const demoWallet = usePipeline((s) => s.demoWallet);
  const failedStage = usePipeline((s) => s.failedStage);
  const quote = usePipeline((s) => s.quote);
  const seal = usePipeline((s) => s.seal);
  const anchorTxHash = usePipeline((s) => s.anchorTxHash);
  const attestation = usePipeline((s) => s.attestation);

  // `borrow(amount)` has no wallet argument — on-chain it is msg.sender. The
  // mock needs the equivalent, and it has to be bound from a component that
  // outlives stage 1, or the binding effect never runs.
  useEffect(() => {
    bindMockWallet(wallet);
  }, [wallet]);

  const active = transitions.activeStage(status, wallet, failedStage);
  const sealUnlocked = transitions.canSeal(status) || status === "anchoring" || status === "processing" || status === "attested";

  return (
    <>
      {/* Stage changes are the main thing happening on this page, and they are
          driven by timers rather than by the user, so they get announced. */}
      <p aria-live="polite" className="sr-only">
        {STATUS_ANNOUNCEMENTS[status]}
      </p>

      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Stepper />
        </aside>

        <div className="min-w-0 space-y-4">
          {/* 1 — Connect */}
          {active === "connect" || !wallet ? (
            <StageConnect />
          ) : (
            <StageSummary
              step={1}
              title="Connected"
              artifacts={[
                { label: demoWallet ? "Demo wallet" : "Wallet", value: wallet },
              ]}
            />
          )}

          {/* 2 — Verify. Stays expanded through `verified` so the pink banner
              and the attack simulator are still on screen while the user fills
              in the seal form directly beneath them. */}
          {wallet ? (
            active === "verify" || status === "failed" || status === "verified" ? (
              <StageVerify />
            ) : quote ? (
              <StageSummary
                step={2}
                title="Enclave verified"
                artifacts={[
                  { label: "Measurement", value: quote.measurement },
                  {
                    label: "Mode",
                    value: quote.mode === 0 ? "hardware" : "simulated",
                    mono: false,
                  },
                ]}
              />
            ) : null
          ) : null}

          {/* 3 — Seal. Not mounted until the store says verification passed. */}
          {sealUnlocked ? (
            active === "seal" ? (
              <StageSeal />
            ) : seal ? (
              <StageSummary
                step={3}
                title="Credential sealed"
                artifacts={[
                  { label: "Request hash", value: seal.requestHash },
                  { label: "Size", value: `${seal.byteLength} bytes`, mono: false },
                ]}
              />
            ) : null
          ) : null}

          {/* 4 — Anchor */}
          {status === "anchoring" || anchorTxHash ? (
            active === "anchor" ? (
              <StageAnchor />
            ) : anchorTxHash ? (
              <StageSummary
                step={4}
                title="Anchored on Coston2"
                artifacts={[
                  {
                    label: "Tx",
                    value: anchorTxHash,
                    href: IS_MOCK ? undefined : explorerTx(anchorTxHash),
                  },
                ]}
              />
            ) : null
          ) : null}

          {/* 5 — Enclave */}
          {status === "processing" || attestation ? (
            active === "processing" ? (
              <StageProcessing />
            ) : (
              <StageSummary
                step={5}
                title="Enclave finished"
                artifacts={[{ label: "Secrets", value: "wiped", mono: false }]}
              />
            )
          ) : null}

          {/* 6 — Attested */}
          {attestation ? <StageAttested /> : null}
        </div>
      </div>

    </>
  );
}
