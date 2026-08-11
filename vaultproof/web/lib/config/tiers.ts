/**
 * Tier table from spec §7. The caps mirror LendingPool.tierCap exactly
 * (6-decimal asset units); if one changes, both change.
 */
export interface Tier {
  id: 0 | 1 | 2 | 3 | 4;
  name: `T${0 | 1 | 2 | 3 | 4}`;
  range: string;
  /** Max loan in whole USDC. */
  cap: number;
  capLabel: string;
}

export const TIERS: readonly Tier[] = [
  { id: 0, name: "T0", range: "under $1,000", cap: 0, capLabel: "none" },
  { id: 1, name: "T1", range: "$1,000 – $10,000", cap: 2_000, capLabel: "$2,000" },
  { id: 2, name: "T2", range: "$10,000 – $50,000", cap: 8_000, capLabel: "$8,000" },
  { id: 3, name: "T3", range: "$50,000 – $250,000", cap: 40_000, capLabel: "$40,000" },
  { id: 4, name: "T4", range: "over $250,000", cap: 150_000, capLabel: "$150,000" },
] as const;

/** LendingPool.tierCap, in 6-decimal units. */
export const TIER_CAPS_6DP: readonly bigint[] = [
  0n,
  2_000_000_000n,
  8_000_000_000n,
  40_000_000_000n,
  150_000_000_000n,
];

export const ASSET_DECIMALS = 6;

export function tierFor(id: number): Tier {
  return TIERS[Math.min(Math.max(id, 0), 4)] ?? TIERS[0]!;
}

/** Reducer used by the enclave; mirrored here only to show the math in the UI. */
export function tierForUsd(usd: number): Tier {
  if (usd < 1_000) return TIERS[0]!;
  if (usd < 10_000) return TIERS[1]!;
  if (usd < 50_000) return TIERS[2]!;
  if (usd < 250_000) return TIERS[3]!;
  return TIERS[4]!;
}
