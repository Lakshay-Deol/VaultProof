"use client";

import { Mono } from "@/components/ui/Mono";
import { tierFor } from "@/lib/config/tiers";
import { usePipeline } from "@/lib/store/pipeline";
import { formatTimestamp, truncate } from "@/lib/utils/format";

/**
 * The demo's final beat.
 *
 * Static once rendered — no hover, no tooltip, nothing that needs a second
 * monitor — so it can hold on screen under narration in a screen recording.
 */
export function KnowsAboutYou() {
  const attestation = usePipeline((s) => s.attestation);
  const exchange = usePipeline((s) => s.exchange);
  if (!attestation) return null;

  const tier = tierFor(attestation.tier);

  const publicFacts: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: "Wallet", value: attestation.wallet, mono: true },
    { label: "Tier", value: `${tier.name} · ${tier.range}` },
    { label: "Expiry", value: formatTimestamp(attestation.expiresAt) },
    { label: "Nullifier", value: attestation.nullifier, mono: true },
    { label: "Measurement", value: attestation.measurement, mono: true },
  ];

  const destroyed: Array<{ label: string; value: string }> = [
    { label: "API key", value: "read-only, never left this tab in plaintext" },
    { label: "API secret", value: "used once, inside the enclave" },
    { label: "Exchange", value: `${exchange} — not in the record` },
    { label: "Balances", value: "0.42 BTC, 3.1 ETH, $180" },
    { label: "Exact total", value: "$58,371" },
    { label: "Account id", value: "consumed by the nullifier, then discarded" },
  ];

  return (
    <section className="card animate-fade-up p-6 sm:p-8" aria-labelledby="knows-title">
      <p className="label">The turn</p>
      <h2 id="knows-title" className="mt-2 text-title font-semibold">
        What VaultProof knows about you now
      </h2>

      <div className="mt-7 grid gap-6 sm:grid-cols-2 sm:gap-10">
        <div>
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <span className="h-2 w-2 rounded-full bg-flare" />
            <h3 className="text-[14px] font-medium">Public, on-chain</h3>
          </div>
          <ul className="mt-1">
            {publicFacts.map((fact) => (
              <li key={fact.label} className="border-b border-line py-3 last:border-0">
                <p className="label mb-1">{fact.label}</p>
                {fact.mono ? (
                  <Mono value={fact.value} label={fact.label} head={14} tail={8} />
                ) : (
                  <p className="text-[14px] text-ink">{fact.value}</p>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <span className="h-2 w-2 rounded-full bg-state-fail" />
            <h3 className="text-[14px] font-medium">Destroyed</h3>
          </div>
          <ul className="mt-1">
            {destroyed.map((item) => (
              <li key={item.label} className="border-b border-line py-3 last:border-0">
                <p className="label mb-1 line-through decoration-state-fail/60">{item.label}</p>
                <p className="text-[14px] text-ink-faint line-through decoration-state-fail/40">
                  {item.value.length > 60 ? truncate(item.value, 40, 12) : item.value}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-8 border-t border-line pt-6 text-[16px] leading-relaxed text-pretty">
        I run this project and I cannot tell you which exchange that was, or how much they hold.
        Neither can my cloud provider. The lender trusted a code hash, and you can rebuild it
        yourself right now.
      </p>
    </section>
  );
}
