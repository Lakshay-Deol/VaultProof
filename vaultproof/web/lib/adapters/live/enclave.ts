import type {
  AttestationQuote,
  EnclaveClient,
  EnclaveStepEvent,
  SealedResponse,
} from "@/lib/adapters/types";

const NOT_WIRED = "not wired yet — set NEXT_PUBLIC_VAULTPROOF_MODE=mock, or finish lib/adapters/live/enclave.ts";

/**
 * Live enclave client. Wiring this up is the whole of "going live" on the
 * enclave side; no file outside lib/adapters/live/ needs to change.
 *
 * Target endpoints (spec §5):
 *   GET  {NEXT_PUBLIC_ENCLAVE_URL}/quote   -> AttestationQuote, mode: 0
 *   POST {NEXT_PUBLIC_ENCLAVE_URL}/action  -> { requestId }
 *
 * The quote's signature must be verified against the Confidential Space /
 * AMD SEV roots in lib/attestation/verify.ts before the caller seals anything.
 * That check belongs in the browser, not here and not on a backend: verifying
 * on our own server proves nothing to the user (spec §6).
 */
export class LiveEnclaveClient implements EnclaveClient {
  async fetchQuote(): Promise<AttestationQuote> {
    throw new Error(`fetchQuote ${NOT_WIRED}`);
  }

  async submitSealed(blob: Uint8Array, txHash: string): Promise<SealedResponse> {
    void blob;
    void txHash;
    throw new Error(`submitSealed ${NOT_WIRED}`);
  }

  async watchProcessing(
    requestId: string,
    onStep: (event: EnclaveStepEvent) => void,
  ): Promise<void> {
    void requestId;
    void onStep;
    throw new Error(`watchProcessing ${NOT_WIRED}`);
  }
}
