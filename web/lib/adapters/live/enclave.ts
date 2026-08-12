import { keccak256 } from "viem";

import type {
  AttestationMode,
  AttestationQuote,
  EnclaveClient,
  EnclaveStepEvent,
  EnclaveStepId,
  SealedResponse,
} from "@/lib/adapters/types";
import { bytesToHex } from "@/lib/utils/format";

/**
 * Live enclave client. Talks to the Go FCE extension (extension/go).
 *
 * Endpoints, matching internal/extension/extension.go:
 *   GET  /quote   -> the attestation quote, with the enclave pubkey inside it
 *   POST /sealed  -> deliver the ciphertext out of band, keyed by request hash
 *   GET  /state   -> counters, used to observe that an attestation landed
 *
 * The quote's signature is verified in the browser by lib/attestation/verify.ts
 * before anything is sealed. That check deliberately does not live here, and
 * never on a backend: verifying on our own server proves nothing to the user
 * (spec §6).
 */

const BASE = (process.env.NEXT_PUBLIC_ENCLAVE_URL ?? "").replace(/\/$/, "");

function requireBase(): string {
  if (!BASE) {
    throw new Error(
      "NEXT_PUBLIC_ENCLAVE_URL is not set — point it at the extension's public URL.",
    );
  }
  return BASE;
}

/** The enclave has a bounded job; a hung upstream should fail, not spin. */
async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${requireBase()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!response.ok) {
      throw new Error(`enclave ${path} returned HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`enclave ${path} timed out`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

interface QuoteResponse {
  measurement: `0x${string}`;
  extensionVersion: string;
  enclavePubKey: `0x${string}`;
  quote: string;
  mode: number;
}

interface StateResponse {
  state: { attestationCount: number; lastTier: number };
}

export class LiveEnclaveClient implements EnclaveClient {
  async fetchQuote(): Promise<AttestationQuote> {
    const raw = await getJSON<QuoteResponse>("/quote");

    if (!raw.enclavePubKey || !raw.measurement) {
      throw new Error("enclave served a quote with no key or measurement");
    }

    return {
      measurement: raw.measurement,
      extensionVersion: raw.extensionVersion,
      enclavePubKey: raw.enclavePubKey,
      quote: raw.quote,
      // Anything other than an explicit 0 is reported as simulated. Defaulting
      // the other way would let a misconfigured enclave claim hardware backing.
      mode: (raw.mode === 0 ? 0 : 1) satisfies AttestationMode,
    };
  }

  /**
   * Delivers the ciphertext after its hash is anchored. The blob travels as
   * hex rather than in calldata, so it is never published permanently.
   */
  async submitSealed(blob: Uint8Array, txHash: string): Promise<SealedResponse> {
    // Must be keccak256, matching StageSeal and the hash anchored on-chain.
    // The enclave keys pending blobs by this value and the ATTEST_SOLVENCY
    // instruction quotes it, so any other digest simply never resolves.
    const requestHash = keccak256(blob);

    const response = await getJSON<{ requestId: string; accepted: boolean }>("/sealed", {
      method: "POST",
      body: JSON.stringify({
        requestHash,
        blob: bytesToHex(blob),
        anchorTx: txHash,
      }),
    });

    return { requestId: response.requestId, accepted: response.accepted };
  }

  /**
   * The enclave does not stream its internal steps — deliberately, since a
   * per-step channel out of the enclave is a side channel. The UI mirrors the
   * five steps on a timer and settles when the attestation count moves.
   */
  async watchProcessing(
    requestId: string,
    onStep: (event: EnclaveStepEvent) => void,
  ): Promise<void> {
    void requestId;
    const steps: EnclaveStepId[] = ["unseal", "query", "price", "reduce", "sign"];

    const before = await this.#attestationCount();

    for (const step of steps) {
      onStep({ step, status: "running" });
      await this.#settle(before);
      onStep({ step, status: "done" });
    }
  }

  async #attestationCount(): Promise<number> {
    try {
      const state = await getJSON<StateResponse>("/state");
      return state.state.attestationCount;
    } catch {
      return -1;
    }
  }

  /** Resolves as soon as the count moves, or after a short beat. */
  async #settle(before: number): Promise<void> {
    const deadline = Date.now() + 1_500;
    while (Date.now() < deadline) {
      if ((await this.#attestationCount()) > before) return;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

