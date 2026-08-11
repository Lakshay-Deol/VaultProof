export type VaultProofMode = "mock" | "live";

/**
 * Single switch for the whole app. Read from the env var at module scope so it
 * is inlined at build time and every consumer agrees.
 */
export const MODE: VaultProofMode =
  process.env.NEXT_PUBLIC_VAULTPROOF_MODE === "live" ? "live" : "mock";

export const IS_MOCK = MODE === "mock";
export const IS_LIVE = MODE === "live";
