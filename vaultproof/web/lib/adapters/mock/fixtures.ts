import { tierForUsd } from "@/lib/config/tiers";

/**
 * The worked example from spec §2 and §5, in one place so the landing page,
 * the FTSO step and the tier card can never disagree with each other.
 */
export const MOCK_HOLDINGS = [
  { asset: "BTC", feed: "BTC/USD", amount: 0.42, price: 118_400 },
  { asset: "ETH", feed: "ETH/USD", amount: 3.1, price: 2_730 },
  { asset: "USD", feed: "—", amount: 180, price: 1 },
] as const;

export const MOCK_LINE_ITEMS = MOCK_HOLDINGS.map((h) => ({
  ...h,
  value: h.asset === "USD" ? h.amount : h.amount * h.price,
}));

export const MOCK_TOTAL_USD = MOCK_LINE_ITEMS.reduce((sum, l) => sum + l.value, 0);

export const MOCK_TIER = tierForUsd(MOCK_TOTAL_USD);

export const MOCK_MEASUREMENT =
  "0x4b7c9e02a1f8d5364ca07b91e3d2f8a45c60b9d17e284f3ab5c96d0e12f4a8e0" as const;

export const MOCK_EXTENSION_VERSION = "vaultproof-v0.3.1";

/**
 * A second whitelisted hash so the registry list looks like a registry rather
 * than a single hardcoded row: an older build that is still trusted.
 */
export const MOCK_OTHER_MEASUREMENT =
  "0x1d3a6f90b27e4c85af106d3b7e92c04f8b5a1e73d6902fc48b31e57a0d92c6b4" as const;

export const MOCK_NULLIFIER =
  "0x9e21c47f0ab8362d15e9074c3fa8b6512d09e7431ca85f60b294d7e13850fa9c" as const;

/** Deterministic stand-in for a judge with no wallet. */
export const DEMO_WALLET = "0x7a3fD1c48B0E9265aF71c3b8De04517Ab9e6c19d" as const;

/** On-chain balance from the worked example: rich off-chain, poor on-chain. */
export const MOCK_ONCHAIN_USDC = 2_000;
export const MOCK_DESIRED_LOAN = 8_000;

export const MOCK_ATTESTATION_VALIDITY_SECONDS = 86_400;

/**
 * Obviously-fake credentials offered in mock mode so a judge can run the seal
 * step without owning a Kraken account. They are sealed for real — the HPKE
 * path does not know or care that the plaintext is nonsense.
 */
export const DEMO_CREDENTIAL = {
  key: "vN5xL2-DEMO-KEY-NOT-A-REAL-KRAKEN-CREDENTIAL",
  secret: "aG9sZGluZ3MtZGVtby1zZWNyZXQtbm90LXJlYWw9PQ==",
} as const;
