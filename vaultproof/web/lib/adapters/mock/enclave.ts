import { exportPublicKey, generateKeyPair, open, sealInfo } from "@/lib/crypto/hpke";
import { CHAIN_ID } from "@/lib/config/chain";
import type {
  AttestationQuote,
  EnclaveClient,
  EnclaveStepEvent,
  SealedResponse,
} from "@/lib/adapters/types";

import { MOCK_EXTENSION_VERSION, MOCK_MEASUREMENT } from "./fixtures";
import { delay, jitter } from "./util";

/**
 * The mock enclave.
 *
 * It generates a real X25519 keypair at module load and publishes the public
 * half in its quote, so the browser's HPKE seal is genuine end to end — the
 * only fiction is that this "enclave" lives in the same tab. `mode: 1` says so
 * out loud, and the UI renders it as an amber SIMULATED badge. The live
 * enclave returns `mode: 0`.
 */

/** Kicked off at module load; awaited lazily so nothing blocks first paint. */
const keyPairPromise: Promise<CryptoKeyPair> = generateKeyPair();

let cachedQuote: AttestationQuote | null = null;

/**
 * Kept module-private and never exported. The private key exists so the mock
 * can actually unseal what the browser sealed, proving the roundtrip.
 */
async function privateKey(): Promise<CryptoKey> {
  return (await keyPairPromise).privateKey;
}

/**
 * A plausible Confidential Space quote body. Not a real signature — mock mode
 * is honest about that via `mode: 1` — but the same shape the live one has, so
 * the UI that renders it does not change when the real quote arrives.
 */
function fakeQuoteBlob(enclavePubKey: string, measurement: string = MOCK_MEASUREMENT): string {
  const header = { alg: "RS256", typ: "JWT", kid: "confidential-space-mock" };
  const body = {
    iss: "https://confidentialcomputing.googleapis.com",
    sub: "vaultproof-fce-extension",
    hwmodel: "AMD_SEV_SNP_SIMULATED",
    swname: "CONFIDENTIAL_SPACE",
    submods: { container: { image_digest: measurement } },
    eat_nonce: enclavePubKey,
  };
  const b64 = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64(header)}.${b64(body)}.${"c2ltdWxhdGVkLXNpZ25hdHVyZQ"}`;
}

const requests = new Map<string, { encLength: number }>();

/**
 * Attack simulation, mock mode only.
 *
 * Claiming "the browser refuses to encrypt unless verification passes" is
 * cheap. Letting anyone press a button and watch it refuse is not. These two
 * settings reproduce the attacks from spec §10 against the real verifier code
 * in lib/attestation/verify.ts — nothing about the check is special-cased.
 */
export type TamperMode = "none" | "substituted-key" | "unwhitelisted-build";

let tamper: TamperMode = "none";

export function setMockTamper(mode: TamperMode): void {
  tamper = mode;
  cachedQuote = null;
}

export function getMockTamper(): TamperMode {
  return tamper;
}

/** A build nobody whitelisted — an image the team never published. */
const ROGUE_MEASUREMENT =
  "0xdead10ccb4d8c0de5e7a91f3b620c47d85ea31f906b2c7d419083fae5c6b271a" as const;

export class MockEnclaveClient implements EnclaveClient {
  async fetchQuote(): Promise<AttestationQuote> {
    await delay(600, 1400);
    if (cachedQuote) return cachedQuote;

    const { publicKey } = await keyPairPromise;
    const enclavePubKey = await exportPublicKey(publicKey);

    if (tamper === "substituted-key") {
      // The relay generates its own keypair and serves that public key, while
      // forwarding the enclave's genuine signed quote untouched.
      const relayKeyPair = await generateKeyPair();
      const relayPubKey = await exportPublicKey(relayKeyPair.publicKey);
      cachedQuote = {
        measurement: MOCK_MEASUREMENT,
        extensionVersion: MOCK_EXTENSION_VERSION,
        enclavePubKey: relayPubKey,
        quote: fakeQuoteBlob(enclavePubKey),
        mode: 1,
      };
      return cachedQuote;
    }

    if (tamper === "unwhitelisted-build") {
      cachedQuote = {
        measurement: ROGUE_MEASUREMENT,
        extensionVersion: "vaultproof-v0.3.1-rogue",
        enclavePubKey,
        quote: fakeQuoteBlob(enclavePubKey, ROGUE_MEASUREMENT),
        mode: 1,
      };
      return cachedQuote;
    }

    cachedQuote = {
      measurement: MOCK_MEASUREMENT,
      extensionVersion: MOCK_EXTENSION_VERSION,
      enclavePubKey,
      quote: fakeQuoteBlob(enclavePubKey),
      mode: 1,
    };
    return cachedQuote;
  }

  /**
   * Accepts the sealed blob and — unlike a pure stub — actually opens it with
   * the private half of the attested keypair. If the browser sealed to the
   * wrong key, or bound the wrong measurement into `info`, this throws, which
   * is exactly what the real enclave does.
   */
  async submitSealed(blob: Uint8Array, txHash: string): Promise<SealedResponse> {
    await delay(500, 1100);

    const encLength = 32; // X25519 encapsulated key
    const info = sealInfo(MOCK_MEASUREMENT, CHAIN_ID);
    // Throws on tamper. The plaintext is dropped on the next line and never
    // returned, logged, or stored — same rule as the Go handler.
    await open(await privateKey(), blob, info, encLength);

    const requestId = `req_${txHash.slice(2, 14)}`;
    requests.set(requestId, { encLength });
    return { requestId, accepted: true };
  }

  async watchProcessing(
    requestId: string,
    onStep: (event: EnclaveStepEvent) => void,
  ): Promise<void> {
    void requestId;
    const steps: Array<{ id: EnclaveStepEvent["step"]; detail: string }> = [
      { id: "unseal", detail: "Credential decrypted into enclave memory." },
      { id: "query", detail: "Signed balance query over pinned TLS." },
      { id: "price", detail: "FTSO feeds read on Coston2." },
      { id: "reduce", detail: "Amount discarded. Nullifier derived." },
      { id: "sign", detail: "Signed via the TEE signing port. Buffers zeroized." },
    ];

    for (const step of steps) {
      onStep({ step: step.id, status: "running" });
      await new Promise((resolve) => setTimeout(resolve, jitter(1000, 2000)));
      onStep({ step: step.id, status: "done", detail: step.detail });
    }
  }
}
