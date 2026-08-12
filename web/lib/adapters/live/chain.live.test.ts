import { describe, expect, it } from "vitest";

import { TIER_CAPS_6DP } from "@/lib/config/tiers";

import { LiveChainClient } from "./chain";

/**
 * Integration test against the real Coston2 deployment. Read-only: it never
 * signs anything, so it needs no key and no funds — but it does need network,
 * so it is opt-in:
 *
 *   npm run test:live
 *
 * Excluded from `npm test` via vitest.config.ts, because a unit suite that
 * fails when the RPC is slow is a unit suite people learn to ignore. The
 * Coston2 public RPC runs ~0.6–1s per call, hence the widened timeout.
 */

const NETWORK_TIMEOUT = 60_000;

// The deployer wallet, which holds a live T2 attestation from the smoke run.
const ATTESTED_WALLET = "0xEa0de9C49d2E935a2c3757F82a42f1e00ab2730e";

describe("LiveChainClient (Coston2)", () => {
  const client = new LiveChainClient();

  it(
    "enumerates the whitelisted measurements",
    async () => {
      const measurements = await client.getWhitelistedMeasurements();
      expect(measurements.length).toBeGreaterThan(0);
      for (const m of measurements) expect(m).toMatch(/^0x[0-9a-f]{64}$/i);
    },
    NETWORK_TIMEOUT,
  );

  it(
    "reads the tier the smoke run attested",
    async () => {
      const tier = await client.getTier(ATTESTED_WALLET);
      expect(tier).toBeGreaterThan(0);
    },
    NETWORK_TIMEOUT,
  );

  it(
    "reads a borrow cap that matches the wallet's current tier",
    async () => {
      // Assert the invariant, not a fixture: the pool's cap must agree with
      // the shared tier table for whatever tier the wallet currently holds.
      // Pinning a specific tier here breaks every time the demo re-attests.
      const tier = await client.getTier(ATTESTED_WALLET);
      const { borrowed, cap } = await client.getBorrowState(ATTESTED_WALLET);

      expect(typeof borrowed).toBe("bigint");
      expect(cap).toBe(TIER_CAPS_6DP[tier]);
    },
    NETWORK_TIMEOUT,
  );

  it(
    "reads zero tier for an address that never attested",
    async () => {
      const tier = await client.getTier("0x000000000000000000000000000000000000dEaD");
      expect(tier).toBe(0);
    },
    NETWORK_TIMEOUT,
  );
});
