import { AeadId, CipherSuite, KdfId, KemId } from "hpke-js";

import { bytesToHex, hexToBytes } from "@/lib/utils/format";

/**
 * Real RFC 9180 HPKE in the browser: X25519 / HKDF-SHA256 / ChaCha20-Poly1305,
 * exactly as spec §6 prescribes. This runs in mock mode too — the only thing
 * mocked is who holds the private key, never the sealing itself.
 *
 * Nothing in this module logs, stores, or returns plaintext.
 */
export const suite = new CipherSuite({
  kem: KemId.DhkemX25519HkdfSha256,
  kdf: KdfId.HkdfSha256,
  aead: AeadId.Chacha20Poly1305,
});

/**
 * Context binding from spec §6. A blob sealed for one enclave build cannot be
 * replayed against another, because the measurement is inside `info`.
 */
export function sealInfo(measurement: string, chainId: number): Uint8Array {
  return new TextEncoder().encode(`vaultproof/v1|${measurement}|${chainId}`);
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return (await suite.kem.generateKeyPair()) as CryptoKeyPair;
}

export async function exportPublicKey(key: CryptoKey): Promise<`0x${string}`> {
  return bytesToHex(new Uint8Array(await suite.kem.serializePublicKey(key)));
}

export async function importPublicKey(hex: string): Promise<CryptoKey> {
  const bytes = hexToBytes(hex);
  return (await suite.kem.deserializePublicKey(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  )) as CryptoKey;
}

export interface SealResult {
  /** enc || ciphertext, the wire format the enclave expects. */
  blob: Uint8Array;
  encLength: number;
}

/**
 * Single-shot seal. `plaintext` is passed in, used, and never retained here —
 * callers are responsible for not putting it anywhere durable either.
 */
export async function seal(
  recipientPublicKeyHex: string,
  plaintext: Uint8Array,
  info: Uint8Array,
): Promise<SealResult> {
  const recipientPublicKey = await importPublicKey(recipientPublicKeyHex);
  const sender = await suite.createSenderContext({ recipientPublicKey, info });
  const ciphertext = new Uint8Array(await sender.seal(plaintext));
  const enc = new Uint8Array(sender.enc);

  const blob = new Uint8Array(enc.length + ciphertext.length);
  blob.set(enc, 0);
  blob.set(ciphertext, enc.length);
  return { blob, encLength: enc.length };
}

/**
 * Mirror of `seal`, used by the mock enclave to prove the roundtrip actually
 * works rather than pretending. The live enclave does this in Go.
 */
export async function open(
  recipientKey: CryptoKey,
  blob: Uint8Array,
  info: Uint8Array,
  encLength: number,
): Promise<Uint8Array> {
  const enc = blob.slice(0, encLength);
  const ciphertext = blob.slice(encLength);
  const recipient = await suite.createRecipientContext({
    recipientKey,
    enc: enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength) as ArrayBuffer,
    info,
  });
  return new Uint8Array(await recipient.open(ciphertext));
}
