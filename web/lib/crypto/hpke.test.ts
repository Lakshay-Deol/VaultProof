import { describe, expect, it } from "vitest";

import {
  exportPublicKey,
  generateKeyPair,
  open,
  seal,
  sealInfo,
} from "./hpke";

const ENC_LENGTH = 32; // X25519 encapsulated key

/**
 * The sealing is real in mock mode too, so it is worth proving that the
 * roundtrip works and that the context binding actually binds.
 */
describe("HPKE seal/open", () => {
  it("round-trips a credential payload", async () => {
    const kp = await generateKeyPair();
    const pub = await exportPublicKey(kp.publicKey);
    const info = sealInfo("0xmeasurement", 114);

    const plaintext = new TextEncoder().encode(JSON.stringify({ apiKey: "x", apiSecret: "y" }));
    const { blob } = await seal(pub, plaintext, info);

    const opened = await open(kp.privateKey, blob, info, ENC_LENGTH);
    expect(JSON.parse(new TextDecoder().decode(opened))).toEqual({ apiKey: "x", apiSecret: "y" });
  });

  it("produces an opaque blob that does not contain the plaintext", async () => {
    const kp = await generateKeyPair();
    const pub = await exportPublicKey(kp.publicKey);
    const { blob } = await seal(
      pub,
      new TextEncoder().encode("SUPER-SECRET-API-KEY"),
      sealInfo("0xm", 114),
    );
    expect(new TextDecoder().decode(blob)).not.toContain("SUPER-SECRET-API-KEY");
    expect(blob.byteLength).toBeGreaterThan(ENC_LENGTH);
  });

  it("refuses to open when the measurement in the context differs", async () => {
    const kp = await generateKeyPair();
    const pub = await exportPublicKey(kp.publicKey);
    const { blob } = await seal(pub, new TextEncoder().encode("hi"), sealInfo("0xbuild-a", 114));

    // A blob sealed for one enclave build must not open under another.
    await expect(open(kp.privateKey, blob, sealInfo("0xbuild-b", 114), ENC_LENGTH)).rejects.toThrow();
  });

  it("refuses to open when the chain id in the context differs", async () => {
    const kp = await generateKeyPair();
    const pub = await exportPublicKey(kp.publicKey);
    const { blob } = await seal(pub, new TextEncoder().encode("hi"), sealInfo("0xm", 114));
    await expect(open(kp.privateKey, blob, sealInfo("0xm", 1), ENC_LENGTH)).rejects.toThrow();
  });

  it("refuses to open with a different recipient key", async () => {
    const enclave = await generateKeyPair();
    const relay = await generateKeyPair();
    const pub = await exportPublicKey(enclave.publicKey);
    const info = sealInfo("0xm", 114);
    const { blob } = await seal(pub, new TextEncoder().encode("hi"), info);

    await expect(open(relay.privateKey, blob, info, ENC_LENGTH)).rejects.toThrow();
  });
});
