import type { AttestationRecord, BorrowState, ChainClient } from "@/lib/adapters/types";
import { TIER_CAPS_6DP } from "@/lib/config/tiers";

import {
  MOCK_ATTESTATION_VALIDITY_SECONDS,
  MOCK_MEASUREMENT,
  MOCK_NULLIFIER,
  MOCK_OTHER_MEASUREMENT,
  MOCK_TIER,
} from "./fixtures";
import { clearState, mutateState, normaliseWallet, readState } from "./state";
import { delay, fakeHash } from "./util";

/**
 * The mock chain.
 *
 * Reads and writes a small localStorage record shaped exactly like the public
 * state a real Coston2 deployment would expose: attestations, borrow balances,
 * anchored request hashes. Nothing private is representable here, which is the
 * point.
 */
export class MockChainClient implements ChainClient {
  async getWhitelistedMeasurements(): Promise<`0x${string}`[]> {
    await delay(700, 1600);
    return [MOCK_MEASUREMENT, MOCK_OTHER_MEASUREMENT];
  }

  async submitRequestHash(hash: string): Promise<{ txHash: `0x${string}` }> {
    await delay(1200, 2500);
    const txHash = fakeHash(`anchor:${hash}`);
    mutateState((state) => {
      state.requests.push({ hash, txHash, at: Date.now() });
    });
    return { txHash };
  }

  /**
   * Resolves with the record the enclave's submitAttestation would have
   * written. Called after the processing sub-stepper finishes, so the timing
   * matches the real event arriving.
   */
  async watchAttestation(wallet: string): Promise<AttestationRecord> {
    await delay(600, 1300);
    const now = Math.floor(Date.now() / 1000);
    const record: AttestationRecord = {
      wallet: wallet as `0x${string}`,
      tier: MOCK_TIER.id,
      issuedAt: now,
      expiresAt: now + MOCK_ATTESTATION_VALIDITY_SECONDS,
      nullifier: MOCK_NULLIFIER,
      measurement: MOCK_MEASUREMENT,
      txHash: fakeHash(`attest:${wallet}:${now}`),
    };
    mutateState((state) => {
      state.attestations[normaliseWallet(wallet)] = record;
    });
    return record;
  }

  /** Mirrors SolvencyRegistry.tierOf: expiry is enforced on read. */
  async getTier(wallet: string): Promise<number> {
    await delay(300, 700);
    const record = readState().attestations[normaliseWallet(wallet)];
    if (!record) return 0;
    if (Math.floor(Date.now() / 1000) >= record.expiresAt) return 0;
    return record.tier;
  }

  async getBorrowState(wallet: string): Promise<BorrowState> {
    await delay(300, 800);
    const state = readState();
    const key = normaliseWallet(wallet);
    const tier = await this.getTier(wallet);
    return {
      borrowed: BigInt(state.borrowed[key] ?? "0"),
      cap: TIER_CAPS_6DP[tier] ?? 0n,
    };
  }

  async borrow(amount: bigint): Promise<{ txHash: `0x${string}` }> {
    await delay(1400, 2500);
    const wallet = lastWallet;
    if (!wallet) throw new Error("no wallet bound to this session");

    const key = normaliseWallet(wallet);
    const state = readState();
    const tier = await this.getTier(wallet);
    const cap = TIER_CAPS_6DP[tier] ?? 0n;
    const current = BigInt(state.borrowed[key] ?? "0");

    // Same two guards as LendingPool.borrow, so the mock can fail honestly.
    if (tier === 0) throw new Error("no valid attestation");
    if (current + amount > cap) throw new Error("over cap");

    mutateState((next) => {
      next.borrowed[key] = (current + amount).toString();
    });
    return { txHash: fakeHash(`borrow:${key}:${(current + amount).toString()}`) };
  }

  async reset(): Promise<void> {
    clearState();
  }
}

/**
 * `borrow(amount)` carries no wallet in the interface — on-chain it is
 * `msg.sender`. The mock needs the equivalent, so the app binds the connected
 * address here when it changes.
 */
let lastWallet: string | null = null;
export function bindMockWallet(wallet: string | null): void {
  lastWallet = wallet;
}
