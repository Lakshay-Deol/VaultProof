import { describe, expect, it } from "vitest";

import type { AttestationQuote } from "@/lib/adapters/types";

import { checkQuoteShape, checkSignatureBinding, checkWhitelist } from "./verify";

const MEASUREMENT = "0x4b7c9e02a1f8d5364ca07b91e3d2f8a45c60b9d17e284f3ab5c96d0e12f4a8e0";
const PUBKEY = "0x2f7a1c0e9b83d5647a12f0c8b3e5d79a4610c82f3b95d7e01a4c6f8b2d0e3a57";

const b64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

function quoteToken(measurement: string, pubKey: string): string {
  return [
    b64url({ alg: "RS256", typ: "JWT" }),
    b64url({
      iss: "https://confidentialcomputing.googleapis.com",
      submods: { container: { image_digest: measurement } },
      eat_nonce: pubKey,
    }),
    "c2ln",
  ].join(".");
}

const honest = (): AttestationQuote => ({
  measurement: MEASUREMENT,
  extensionVersion: "vaultproof-v0.3.1",
  enclavePubKey: PUBKEY,
  quote: quoteToken(MEASUREMENT, PUBKEY),
  mode: 1,
});

describe("checkQuoteShape", () => {
  it("accepts a well-formed quote", () => {
    expect(checkQuoteShape(honest()).ok).toBe(true);
  });

  it("rejects a measurement that is not a 32-byte hash", () => {
    const result = checkQuoteShape({ ...honest(), measurement: "0x1234" as `0x${string}` });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/32-byte hash/);
  });

  it("rejects a public key that is not a 32-byte X25519 key", () => {
    const result = checkQuoteShape({ ...honest(), enclavePubKey: "0xdead" as `0x${string}` });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/X25519/);
  });

  it("rejects a token that is not a well-formed attestation", () => {
    expect(checkQuoteShape({ ...honest(), quote: "not-a-token" }).ok).toBe(false);
  });
});

describe("checkSignatureBinding", () => {
  it("accepts a quote whose key and measurement are both inside the signature", () => {
    expect(checkSignatureBinding(honest()).ok).toBe(true);
  });

  /** Spec §10, attack 1. This is the check the whole product rests on. */
  it("rejects a substituted relay public key", () => {
    const relayKey = "0x9999999999999999999999999999999999999999999999999999999999999999";
    const result = checkSignatureBinding({
      ...honest(),
      enclavePubKey: relayKey as `0x${string}`,
      // The relay forwards the enclave's genuine, untouched quote.
      quote: quoteToken(MEASUREMENT, PUBKEY),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/substituted relay key/);
  });

  it("rejects a measurement swapped alongside the quote", () => {
    const result = checkSignatureBinding({
      ...honest(),
      measurement: `0x${"a".repeat(64)}` as `0x${string}`,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not the one inside it/);
  });

  it("names the real hardware root only when mode is 0", () => {
    expect(checkSignatureBinding({ ...honest(), mode: 0 }).note).toMatch(/AMD SEV-SNP/);
    expect(checkSignatureBinding(honest()).note).toMatch(/simulated root/);
  });
});

describe("checkWhitelist", () => {
  it("matches case-insensitively and reports the matching hash", () => {
    const result = checkWhitelist(honest(), [MEASUREMENT.toUpperCase()]);
    expect(result.ok).toBe(true);
    expect(result.match?.toLowerCase()).toBe(MEASUREMENT);
  });

  it("rejects a build the chain has never trusted", () => {
    const result = checkWhitelist(honest(), [`0x${"b".repeat(64)}`]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not whitelisted/);
  });

  it("rejects when the registry returns nothing", () => {
    expect(checkWhitelist(honest(), []).ok).toBe(false);
  });
});
