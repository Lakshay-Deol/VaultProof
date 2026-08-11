"use client";

import { useEffect } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { StageCard } from "@/components/app/StageShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Mono } from "@/components/ui/Mono";
import { DEMO_WALLET } from "@/lib/adapters/mock/fixtures";
import { CHAIN_ID, coston2, explorerAddress } from "@/lib/config/chain";
import { IS_MOCK } from "@/lib/config/mode";
import { usePipeline } from "@/lib/store/pipeline";

/**
 * Stage 1. The attestation is bound to a wallet address, so the address has to
 * exist before anything else happens.
 *
 * In mock mode there is also a demo wallet: a judge with no MetaMask and no
 * testnet funds still needs to reach stage 6, and a submission that requires a
 * wallet install before the first screen is a submission nobody tests.
 */
export function StageConnect() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const wallet = usePipeline((s) => s.wallet);
  const demoWallet = usePipeline((s) => s.demoWallet);
  const setWallet = usePipeline((s) => s.setWallet);

  // A real connection always wins over the demo wallet.
  useEffect(() => {
    if (isConnected && address) setWallet(address, false);
    else if (!demoWallet) setWallet(null, false);
  }, [isConnected, address, demoWallet, setWallet]);

  const wrongNetwork = isConnected && chainId !== CHAIN_ID;

  if (wallet) {
    return (
      <StageCard
        step={1}
        title="Wallet connected"
        lede="The attestation will be bound to this address. A record for one wallet cannot be replayed against another."
        aside={
          demoWallet ? (
            <Badge tone="pending">Demo wallet</Badge>
          ) : wrongNetwork ? (
            <Badge tone="fail">Wrong network</Badge>
          ) : (
            <Badge tone="ok">Coston2 · 114</Badge>
          )
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4 rounded border border-line bg-surface-alt px-4 py-3.5">
          <div className="min-w-0">
            <p className="label mb-1.5">Address</p>
            <Mono
              value={wallet}
              full
              label="Wallet address"
              href={demoWallet ? undefined : explorerAddress(wallet)}
            />
          </div>
          <Button
            variant="quiet"
            size="sm"
            onClick={() => {
              if (demoWallet) setWallet(null, false);
              else disconnect();
            }}
          >
            {demoWallet ? "Exit demo wallet" : "Disconnect"}
          </Button>
        </div>

        {wrongNetwork ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-state-fail/40 bg-state-failSoft px-4 py-3">
            <p className="text-[14px] text-state-fail">
              This wallet is on chain {chainId}. VaultProof reads {coston2.name}.
            </p>
            <Button size="sm" onClick={() => switchChain({ chainId: CHAIN_ID })} disabled={isSwitching}>
              {isSwitching ? "Switching…" : "Switch to Coston2"}
            </Button>
          </div>
        ) : null}

        {demoWallet ? (
          <p className="mt-4 text-[13px] leading-relaxed text-ink-faint">
            The demo wallet is a fixed address with no keys. Every other step below runs for
            real, including the HPKE sealing.
          </p>
        ) : null}
      </StageCard>
    );
  }

  return (
    <StageCard
      step={1}
      title="Connect a wallet"
      lede="VaultProof binds a solvency tier to an address on Coston2. Pick how you want to run the demo."
    >
      {/* Mock mode puts the no-install path first: a judge who has to install a
          wallet before the first screen is a judge who does not finish. */}
      {IS_MOCK ? (
        <button
          type="button"
          onClick={() => setWallet(DEMO_WALLET, true)}
          className="card card-hover mb-3 flex w-full items-center justify-between gap-3 border-flare-border bg-flare-soft/40 px-5 py-5 text-left transition-colors hover:border-flare"
        >
          <span>
            <span className="flex flex-wrap items-center gap-2 text-[16px] font-medium">
              Demo wallet
              <Badge tone="flare">No install, no funds</Badge>
            </span>
            <span className="mt-1 block text-[13.5px] leading-relaxed text-ink-muted">
              A fixed address with no keys. Every other step runs for real, including the
              in-browser HPKE sealing.
            </span>
          </span>
          <Arrow />
        </button>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            type="button"
            onClick={() => connect({ connector, chainId: CHAIN_ID })}
            disabled={isPending}
            className="card card-hover flex items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:border-ink disabled:opacity-50"
          >
            <span>
              <span className="block text-[15px] font-medium">{connector.name}</span>
              <span className="mt-0.5 block text-[13px] text-ink-muted">
                Connect and switch to Coston2.
              </span>
            </span>
            <Arrow />
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-4 text-[14px] text-state-fail">{error.message}</p>
      ) : null}
    </StageCard>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
