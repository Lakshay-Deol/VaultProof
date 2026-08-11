"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Mono } from "@/components/ui/Mono";
import { getChainClient } from "@/lib/adapters";
import { MOCK_DESIRED_LOAN, MOCK_ONCHAIN_USDC } from "@/lib/adapters/mock/fixtures";
import { ADDRESSES } from "@/lib/config/addresses";
import { explorerAddress, explorerTx } from "@/lib/config/chain";
import { IS_MOCK } from "@/lib/config/mode";
import { tierFor } from "@/lib/config/tiers";
import { usePipeline } from "@/lib/store/pipeline";
import { formatUnits6, formatUsd, toUnits6 } from "@/lib/utils/format";

/**
 * The consuming side. The attestation extends the borrowing cap; it does not
 * replace collateral. Undercollateralised is not uncollateralised, and the UI
 * says so rather than implying the loan is free.
 */
export function LendingPanel() {
  const wallet = usePipeline((s) => s.wallet);
  const attestation = usePipeline((s) => s.attestation);
  const borrowedUnits = usePipeline((s) => s.borrowedUnits);
  const capUnits = usePipeline((s) => s.capUnits);
  const borrowTxHash = usePipeline((s) => s.borrowTxHash);
  const setBorrowState = usePipeline((s) => s.setBorrowState);
  const setBorrowTx = usePipeline((s) => s.setBorrowTx);

  const [amount, setAmount] = useState(String(MOCK_DESIRED_LOAN));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    void getChainClient()
      .getBorrowState(wallet)
      .then((state) => {
        if (!cancelled) setBorrowState(state.borrowed, state.cap);
      })
      .catch(() => {
        /* the panel degrades to "cap unknown" rather than blocking stage 6 */
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, setBorrowState, borrowTxHash]);

  if (!attestation) return null;

  const tier = tierFor(attestation.tier);
  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0;
  const requested = valid ? toUnits6(parsed) : 0n;
  const available = capUnits > borrowedUnits ? capUnits - borrowedUnits : 0n;
  const overCap = requested > available;

  async function onBorrow() {
    if (!valid || overCap || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { txHash } = await getChainClient().borrow(requested);
      setBorrowTx(txHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Borrow failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card animate-fade-up p-6 sm:p-8" aria-labelledby="lending-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label">LendingPool</p>
          <h2 id="lending-title" className="mt-2 text-title font-semibold">
            The loan that was refused
          </h2>
        </div>
        <Badge tone="flare">{tier.name} cap</Badge>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="On-chain collateral" value={formatUsd(MOCK_ONCHAIN_USDC)} sub="what the chain could see before" />
        <Stat label={`${tier.name} cap`} value={tier.capLabel} sub="what the attestation adds" accent />
        <Stat label="Already borrowed" value={formatUnits6(borrowedUnits)} sub="against this attestation" />
      </div>

      {borrowTxHash ? (
        <div className="mt-6 animate-fade-up rounded border border-state-ok/40 bg-state-okSoft px-5 py-4">
          <p className="text-[15px] font-medium text-state-ok">
            {formatUnits6(borrowedUnits)} USDC transferred.
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
            The same wallet that could not borrow {formatUsd(MOCK_DESIRED_LOAN)} an hour ago just
            did, and the pool still does not know which exchange backed it.
          </p>
          <div className="mt-3">
            <Mono
              value={borrowTxHash}
              label="Borrow transaction"
              head={14}
              tail={10}
              href={IS_MOCK ? undefined : explorerTx(borrowTxHash)}
            />
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <label htmlFor="borrow-amount" className="label mb-2 block">
            Borrow
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <input
                id="borrow-amount"
                type="number"
                min="0"
                step="100"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-44 rounded border border-line bg-surface py-2.5 pl-3.5 pr-16 font-mono text-[15px] tabular-nums text-ink transition-colors focus:border-flare"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center font-mono text-[13px] text-ink-faint">
                USDC
              </span>
            </div>
            <Button onClick={onBorrow} disabled={!valid || overCap || busy}>
              {busy ? "Borrowing…" : "Borrow"}
            </Button>
            <span className="text-[13px] text-ink-muted">
              {formatUnits6(available)} available under the {tier.name} cap
            </span>
          </div>

          {overCap ? (
            <p className="mt-3 text-[14px] text-state-pending">
              Over cap. {tier.name} tops out at {tier.capLabel}; the contract reverts rather than
              trusting the front end.
            </p>
          ) : null}
          {error ? <p className="mt-3 text-[14px] text-state-fail">{error}</p> : null}
        </div>
      )}

      <p className="mt-6 border-t border-line pt-4 text-[13px] leading-relaxed text-ink-faint">
        The attestation extends the cap, it does not replace collateral. Contract:{" "}
        <Mono
          value={ADDRESSES.lendingPool}
          label="LendingPool"
          href={IS_MOCK ? undefined : explorerAddress(ADDRESSES.lendingPool)}
        />
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
          ? "rounded border border-flare-border bg-flare-soft/50 px-4 py-3.5"
          : "rounded border border-line px-4 py-3.5"
      }
    >
      <p className="label">{label}</p>
      <p className="mt-1.5 font-mono text-[20px] font-medium tabular-nums tracking-tight">
        {value}
      </p>
      <p className="mt-1 text-[12.5px] leading-snug text-ink-faint">{sub}</p>
    </div>
  );
}
