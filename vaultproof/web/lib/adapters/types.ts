/**
 * The seam.
 *
 * Everything the UI knows about "the enclave" and "the chain" is these two
 * interfaces. Mock implementations run the whole demo with no backend and no
 * deployment; live implementations talk to the FCE extension and Coston2.
 * Swapping between them is one env var, and adding the live behaviour touches
 * only lib/adapters/live/.
 */

/** 0 = real hardware attestation. 1 = simulated (SIMULATED_TEE=true). Spec §13. */
export type AttestationMode = 0 | 1;

export interface AttestationQuote {
  /** Hash of the loaded enclave image — the identity of the software. */
  measurement: `0x${string}`;
  /** Human-readable build tag, e.g. "vaultproof-v0.3.1". */
  extensionVersion: string;
  /** X25519 public key generated at enclave boot, embedded in the signed quote. */
  enclavePubKey: `0x${string}`;
  /** The platform-signed quote itself (base64/JWT-ish blob). */
  quote: string;
  mode: AttestationMode;
}

export interface SealedResponse {
  /** Opaque acknowledgement id; the real reply is sealed to the response key. */
  requestId: string;
  accepted: boolean;
}

/** The five confidential steps, mirrored in the UI sub-stepper. */
export type EnclaveStepId = "unseal" | "query" | "price" | "reduce" | "sign";

export interface EnclaveStepEvent {
  step: EnclaveStepId;
  status: "running" | "done";
  /** Step-specific detail the enclave is willing to disclose. */
  detail?: string;
}

export interface AttestationRecord {
  wallet: `0x${string}`;
  tier: number;
  issuedAt: number;
  expiresAt: number;
  nullifier: `0x${string}`;
  measurement: `0x${string}`;
  /** Tx that carried submitAttestation, for the explorer link. */
  txHash: `0x${string}`;
}

export interface BorrowState {
  borrowed: bigint;
  cap: bigint;
}

export interface EnclaveClient {
  fetchQuote(): Promise<AttestationQuote>;
  submitSealed(blob: Uint8Array, txHash: string): Promise<SealedResponse>;
  /**
   * Streams the enclave's five internal steps so the UI can mirror them.
   * Live mode will poll or subscribe; mock mode emits on a timer.
   */
  watchProcessing(
    requestId: string,
    onStep: (event: EnclaveStepEvent) => void,
  ): Promise<void>;
}

export interface ChainClient {
  /** TeeExtensionRegistry: the code hashes lenders have agreed to trust. */
  getWhitelistedMeasurements(): Promise<`0x${string}`[]>;
  /** InstructionSender: anchor keccak256(blob) before the ciphertext moves. */
  submitRequestHash(hash: string): Promise<{ txHash: `0x${string}` }>;
  /** SolvencyRegistry: resolve once the Attested event for this wallet lands. */
  watchAttestation(wallet: string): Promise<AttestationRecord>;
  getTier(wallet: string): Promise<number>;
  getBorrowState(wallet: string): Promise<BorrowState>;
  borrow(amount: bigint): Promise<{ txHash: `0x${string}` }>;
  /** Demo hygiene: drop any persisted mock state. No-op on live. */
  reset(): Promise<void>;
}
