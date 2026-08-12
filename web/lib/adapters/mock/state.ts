import type { AttestationRecord } from "@/lib/adapters/types";

/**
 * Mock chain state, held in memory for the lifetime of the tab and nowhere else.
 *
 * Deliberately not persisted: connecting a wallet is stage 1 of the pipeline,
 * and a reload must land back there with nothing carried over. Persisting it
 * meant a returning visitor was silently restored mid-flow — an attestation
 * they never watched happen, from a session they'd already finished.
 *
 * The shape below is exactly what a real chain would expose publicly; nothing
 * credential-derived is representable here, which is the point.
 */
export interface MockState {
  version: 1;
  attestations: Record<string, AttestationRecord>;
  borrowed: Record<string, string>; // wallet -> bigint as decimal string
  requests: Array<{ hash: string; txHash: string; at: number }>;
}

const empty = (): MockState => ({
  version: 1,
  attestations: {},
  borrowed: {},
  requests: [],
});

let state: MockState = empty();

export function readState(): MockState {
  return state;
}

export function writeState(next: MockState): void {
  state = next;
}

export function mutateState(fn: (draft: MockState) => void): MockState {
  fn(state);
  return state;
}

export function clearState(): void {
  state = empty();
}

export const normaliseWallet = (wallet: string) => wallet.toLowerCase();
