"use client";

import { useEffect, useState } from "react";

import { StageCard } from "@/components/app/StageShell";
import { LendingPanel } from "@/components/app/LendingPanel";
import { KnowsAboutYou } from "@/components/app/KnowsAboutYou";
import { Badge, TierBadge } from "@/components/ui/Badge";
import { Mono } from "@/components/ui/Mono";
import { ADDRESSES } from "@/lib/config/addresses";
import { explorerAddress, explorerTx } from "@/lib/config/chain";
import { IS_MOCK } from "@/lib/config/mode";
import { tierFor } from "@/lib/config/tiers";
import { usePipeline } from "@/lib/store/pipeline";
import { formatCountdown, formatTimestamp } from "@/lib/utils/format";

/**
 * Stage 6. The record, the loan it unlocks, and the closing beat.
 *
 * Everything here is public information. That is the demo's argument, made by
 * showing the whole output rather than describing it.
 */
export function StageAttested() {
  const attestation = usePipeline((s) => s.attestation);
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!attestation) return;
    const tick = () => setRemaining(attestation.expiresAt * 1000 - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [attestation]);

  if (!attestation) return null;
  const tier = tierFor(attestation.tier);
  const expired = remaining <= 0;

  return (
    <div className="space-y-4">
      <StageCard
        step={6}
        title="Attested"
        lede="This is the entire record. A lending contract reads it and extends credit; nothing else about the borrower was written anywhere."
        aside={<Badge tone={expired ? "fail" : "ok"}>{expired ? "Expired" : "Valid"}</Badge>}
      >
        <div className="grid gap-5 rounded border border-flare-border bg-flare-soft/40 px-5 py-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-8">
          <div className="flex items-center gap-4">
            <TierBadge tier={tier.id} size="lg" />
            <div>
              <p className="text-[20px] font-semibold leading-tight tracking-tight">{tier.range}</p>
              <p className="mt-1 text-[13.5px] text-ink-muted">
                Borrow cap {tier.capLabel} · about 2.5 bits of wealth data
              </p>
            </div>
          </div>

          <div className="sm:text-right">
            <p className="label mb-1.5">Expires in</p>
            <p className="font-mono text-[22px] font-medium tabular-nums tracking-tight">
              {formatCountdown(remaining)}
            </p>
            <p className="mt-1 text-[13px] text-ink-faint">
              {formatTimestamp(attestation.expiresAt)}
            </p>
          </div>
        </div>

        <p className="mt-4 text-[13.5px] leading-relaxed text-ink-muted">
          Expiry is enforced inside <span className="font-mono text-[12.5px]">tierOf</span>, in the
          read path, so a stale attestation cannot be used even if nobody prunes it.
        </p>

        <dl className="mt-6 divide-y divide-line border-y border-line">
          <Row label="Wallet" value={attestation.wallet} href={IS_MOCK ? undefined : explorerAddress(attestation.wallet)} />
          <Row label="Nullifier" value={attestation.nullifier} note="Stable per exchange account, unlinkable back to it." />
          <Row label="Measurement" value={attestation.measurement} note="Which enclave build produced this." />
          <Row
            label="Attested event"
            value={attestation.txHash}
            href={IS_MOCK ? undefined : explorerTx(attestation.txHash)}
            note={IS_MOCK ? "Mock transaction — no explorer link in mock mode." : undefined}
          />
          <Row
            label="SolvencyRegistry"
            value={ADDRESSES.solvencyRegistry}
            href={IS_MOCK ? undefined : explorerAddress(ADDRESSES.solvencyRegistry)}
          />
        </dl>
      </StageCard>

      <LendingPanel />
      <KnowsAboutYou />
    </div>
  );
}

function Row({
  label,
  value,
  href,
  note,
}: {
  label: string;
  value: string;
  href?: string;
  note?: string;
}) {
  return (
    <div className="grid gap-1.5 py-3.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-baseline sm:gap-4">
      <dt className="label">{label}</dt>
      <dd className="min-w-0">
        <Mono value={value} label={label} head={16} tail={10} href={href} />
        {note ? <p className="mt-1 text-[13px] leading-snug text-ink-faint">{note}</p> : null}
      </dd>
    </div>
  );
}
