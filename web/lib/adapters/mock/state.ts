import type { AttestationRecord } from "@/lib/adapters/types";

/**
 * Persisted mock chain state. A refresh mid-demo must not lose the attestation
 * or the borrow — a judge who reloads the page should still see their tier.
 *
 * Nothing credential-derived is ever written here. The shape below is exactly
 * what a real chain would expose publicly.
 */
export interface MockState {
  version: 1;
  attestations: Record<string, AttestationRecord>;
  borrowed: Record<string, string>; // wallet -> bigint as decimal string
  requests: Array<{ hash: string; txHash: string; at: number }>;
}

const KEY = "vaultproof.mock.v1";

const empty = (): MockState => ({
  version: 1,
  attestations: {},
  borrowed: {},
  requests: [],
});

export function readState(): MockState {
  if (typeof window === "undefined") return empty();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as MockState;
    if (parsed.version !== 1) return empty();
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

export function writeState(next: MockState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota or private mode — the demo still works, it just stops persisting */
  }
}

export function mutateState(fn: (state: MockState) => void): MockState {
  const state = readState();
  fn(state);
  writeState(state);
  return state;
}

export function clearState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const normaliseWallet = (wallet: string) => wallet.toLowerCase();
