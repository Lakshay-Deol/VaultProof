import { CountUp } from "@/components/ui/CountUp";
import { Reveal } from "@/components/ui/Reveal";
import { MOCK_ATTESTATION_VALIDITY_SECONDS } from "@/lib/adapters/mock/fixtures";
import { TIERS } from "@/lib/config/tiers";

/**
 * Four numbers that are each an argument, not decoration.
 *
 * Every value is derived from the same tables the app runs on — change a tier
 * cap or the attestation lifetime and this band follows, so it can never
 * advertise a number the product does not honour.
 */
const STATS = [
  {
    value: 5,
    label: "fields written on-chain",
    note: "wallet, tier, expiry, nullifier, measurement",
  },
  {
    value: 0,
    label: "secrets that leave the tab in the clear",
    note: "sealed to the enclave's attested key, in-browser",
  },
  {
    value: TIERS[4]!.cap,
    format: "usd",
    label: "borrow cap at the top tier",
    note: "against no on-chain collateral",
  },
  {
    value: MOCK_ATTESTATION_VALIDITY_SECONDS / 3600,
    suffix: "h",
    label: "attestation lifetime",
    note: "then the tier expires and must be re-proved",
  },
] as const;

export function StatsBand() {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
      {STATS.map((stat, i) => (
        <Reveal
          key={stat.label}
          delay={i * 80}
          className="card-lit group bg-surface-raised p-6 transition-colors duration-300 hover:bg-surface-sunk"
        >
          <p className="font-mono text-[30px] font-medium leading-none tracking-tight text-ink transition-colors duration-300 group-hover:text-flare-ink sm:text-[34px]">
            <CountUp
              to={stat.value}
              format={"format" in stat ? stat.format : undefined}
              suffix={"suffix" in stat ? stat.suffix : undefined}
            />
          </p>
          <p className="mt-3.5 text-[14px] font-medium leading-snug">{stat.label}</p>
          <p className="mt-1.5 text-[13px] leading-snug text-ink-faint">{stat.note}</p>
        </Reveal>
      ))}
    </div>
  );
}
