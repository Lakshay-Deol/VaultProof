import type { SealArtifact } from "./pipeline";

/**
 * In-memory holder for the sealed blob.
 *
 * The ciphertext is safe to hold — it is what gets posted to the relay — but it
 * is kept out of the zustand store and out of any persistence layer anyway, so
 * that nothing in this app has a serialisable path from "user submitted a
 * credential" to disk. The plaintext never reaches this module at all.
 */
let blob: Uint8Array | null = null;
let artifact: SealArtifact | null = null;

export function holdSealed(next: Uint8Array, meta: SealArtifact): void {
  blob = next;
  artifact = meta;
}

export function takeSealedBlob(): Uint8Array | null {
  return blob;
}

export function heldArtifact(): SealArtifact | null {
  return artifact;
}

export function dropSealed(): void {
  if (blob) blob.fill(0);
  blob = null;
  artifact = null;
}
