import type { AttestationRecord, BorrowState, ChainClient } from "@/lib/adapters/types";

const NOT_WIRED = "not wired yet — set NEXT_PUBLIC_VAULTPROOF_MODE=mock, or finish lib/adapters/live/chain.ts";

/**
 * Live Coston2 client.
 *
 * Everything needed to implement this already exists in the repo:
 *   - chain + explorer:  lib/config/chain.ts   (coston2, id 114)
 *   - addresses:         lib/config/addresses.ts
 *   - ABIs:              lib/abis/*.ts
 *
 * Reads go through viem's public client; writes go through the connected
 * wallet client from wagmi. `watchAttestation` should watch the
 * SolvencyRegistry `Attested` event filtered on the wallet, with a
 * getLogs backfill for the case where the event lands before the watcher does.
 */
export class LiveChainClient implements ChainClient {
  async getWhitelistedMeasurements(): Promise<`0x${string}`[]> {
    throw new Error(`getWhitelistedMeasurements ${NOT_WIRED}`);
  }

  async submitRequestHash(hash: string): Promise<{ txHash: `0x${string}` }> {
    void hash;
    throw new Error(`submitRequestHash ${NOT_WIRED}`);
  }

  async watchAttestation(wallet: string): Promise<AttestationRecord> {
    void wallet;
    throw new Error(`watchAttestation ${NOT_WIRED}`);
  }

  async getTier(wallet: string): Promise<number> {
    void wallet;
    throw new Error(`getTier ${NOT_WIRED}`);
  }

  async getBorrowState(wallet: string): Promise<BorrowState> {
    void wallet;
    throw new Error(`getBorrowState ${NOT_WIRED}`);
  }

  async borrow(amount: bigint): Promise<{ txHash: `0x${string}` }> {
    void amount;
    throw new Error(`borrow ${NOT_WIRED}`);
  }

  async reset(): Promise<void> {
    // Nothing to reset on a real chain.
  }
}
