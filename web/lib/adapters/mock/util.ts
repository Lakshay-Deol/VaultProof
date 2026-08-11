/**
 * Latency and pseudo-randomness helpers for the mock adapters.
 *
 * Latency is jittered because a demo where every call takes exactly 800ms
 * reads as a `setTimeout` loop. Hashes are derived from a seeded PRNG so the
 * same wallet always produces the same tx hashes across reloads.
 */
export function jitter(minMs: number, maxMs: number): number {
  return Math.round(minMs + Math.random() * (maxMs - minMs));
}

export function delay(minMs: number, maxMs = minMs): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, jitter(minMs, maxMs)));
}

/** FNV-1a, enough for demo determinism. */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic 32-byte hex derived from a label. Looks like a real hash. */
export function fakeHash(label: string): `0x${string}` {
  let seed = hash32(label);
  let out = "";
  for (let i = 0; i < 32; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    out += ((seed >>> 24) & 0xff).toString(16).padStart(2, "0");
  }
  return `0x${out}`;
}

/** Cryptographically random 32-byte hex — used for the single-use nonce. */
export function randomHex32(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return `0x${out}`;
}
