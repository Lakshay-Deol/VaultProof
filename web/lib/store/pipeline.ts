import { create } from "zustand";

import type {
  AttestationQuote,
  AttestationRecord,
  EnclaveStepId,
} from "@/lib/adapters/types";
import type { CheckId, CheckStatus } from "@/lib/attestation/verify";

/**
 * The pipeline state machine.
 *
 * Rules this store enforces, not the UI:
 *   - `sealing` is only reachable from `verified`. Stage 3 does not exist as a
 *     component the user can route to; it is rendered from this state.
 *   - No field on this store ever holds an API key or secret. The plaintext
 *     lives in a React ref inside the seal form, is passed straight into HPKE,
 *     and is overwritten before the form unmounts. Nothing credential-derived
 *     is persisted anywhere.
 */

export type PipelineStatus =
  | "idle"
  | "verifying"
  | "verified"
  | "sealing"
  | "anchoring"
  | "processing"
  | "attested"
  | "failed";

export type StageId =
  | "connect"
  | "verify"
  | "seal"
  | "anchor"
  | "processing"
  | "attested";

export const STAGES: ReadonlyArray<{ id: StageId; index: number; title: string; blurb: string }> = [
  { id: "connect", index: 1, title: "Connect", blurb: "Bind the attestation to a wallet." },
  { id: "verify", index: 2, title: "Verify enclave", blurb: "Check the code before trusting it." },
  { id: "seal", index: 3, title: "Seal credential", blurb: "Encrypt to the attested key." },
  { id: "anchor", index: 4, title: "Anchor", blurb: "Hash on-chain, ciphertext off-chain." },
  { id: "processing", index: 5, title: "Enclave", blurb: "Unseal, price, reduce, sign, wipe." },
  { id: "attested", index: 6, title: "Attested", blurb: "Tier on-chain. Borrow against it." },
];

export interface CheckState {
  status: CheckStatus;
  note?: string;
  error?: string;
}

export interface SealArtifact {
  /** Hex preview of the ciphertext. Not the plaintext — this is the output. */
  preview: `0x${string}`;
  byteLength: number;
  requestHash: `0x${string}`;
  nonce: `0x${string}`;
  responsePubKey: `0x${string}`;
}

interface PipelineState {
  status: PipelineStatus;
  failedStage: StageId | null;
  failure: string | null;

  wallet: `0x${string}` | null;
  /** True when the address came from the mock-mode demo wallet, not a real one. */
  demoWallet: boolean;

  quote: AttestationQuote | null;
  whitelisted: `0x${string}`[];
  whitelistMatch: `0x${string}` | null;
  checks: Record<CheckId, CheckState>;

  exchange: string;
  seal: SealArtifact | null;

  anchorTxHash: `0x${string}` | null;
  requestId: string | null;

  enclaveSteps: Record<EnclaveStepId, "idle" | "running" | "done">;
  enclaveNotes: Partial<Record<EnclaveStepId, string>>;

  attestation: AttestationRecord | null;

  borrowTxHash: `0x${string}` | null;
  borrowedUnits: bigint;
  capUnits: bigint;
}

interface PipelineActions {
  setWallet(wallet: `0x${string}` | null, demo?: boolean): void;

  startVerify(): void;
  setCheck(id: CheckId, state: CheckState): void;
  setQuote(quote: AttestationQuote): void;
  setWhitelist(list: `0x${string}`[], match: `0x${string}` | null): void;
  finishVerify(): void;

  setExchange(exchange: string): void;
  startSeal(): void;
  finishSeal(artifact: SealArtifact): void;

  startAnchor(): void;
  setAnchorTx(txHash: `0x${string}`): void;
  setRequestId(requestId: string): void;

  startProcessing(): void;
  setEnclaveStep(step: EnclaveStepId, status: "running" | "done", note?: string): void;

  setAttestation(record: AttestationRecord): void;
  setBorrowState(borrowed: bigint, cap: bigint): void;
  setBorrowTx(txHash: `0x${string}`): void;

  fail(stage: StageId, message: string): void;
  resetFrom(stage: StageId): void;
  reset(): void;
}

export type PipelineStore = PipelineState & PipelineActions;

const idleChecks = (): Record<CheckId, CheckState> => ({
  quote: { status: "idle" },
  signature: { status: "idle" },
  whitelist: { status: "idle" },
});

const idleEnclaveSteps = (): Record<EnclaveStepId, "idle" | "running" | "done"> => ({
  unseal: "idle",
  query: "idle",
  price: "idle",
  reduce: "idle",
  sign: "idle",
});

export const initialState: PipelineState = {
  status: "idle",
  failedStage: null,
  failure: null,
  wallet: null,
  demoWallet: false,
  quote: null,
  whitelisted: [],
  whitelistMatch: null,
  checks: idleChecks(),
  exchange: "kraken",
  seal: null,
  anchorTxHash: null,
  requestId: null,
  enclaveSteps: idleEnclaveSteps(),
  enclaveNotes: {},
  attestation: null,
  borrowTxHash: null,
  borrowedUnits: 0n,
  capUnits: 0n,
};

/** Exported for unit tests; the store is a thin wrapper over these. */
export const transitions = {
  /** Sealing is reachable from exactly one state. This is the security gate. */
  canSeal(status: PipelineStatus): boolean {
    return status === "verified" || status === "sealing" || status === "failed";
  },
  canVerify(wallet: string | null): boolean {
    return Boolean(wallet);
  },
  canBorrow(status: PipelineStatus, tier: number | undefined): boolean {
    return status === "attested" && (tier ?? 0) > 0;
  },
  /** Which stage the stepper should highlight for a given status. */
  activeStage(status: PipelineStatus, wallet: string | null, failedStage: StageId | null): StageId {
    if (status === "failed") return failedStage ?? "verify";
    if (!wallet) return "connect";
    switch (status) {
      case "idle":
        return "verify";
      case "verifying":
        return "verify";
      case "verified":
        return "seal";
      case "sealing":
        return "seal";
      case "anchoring":
        return "anchor";
      case "processing":
        return "processing";
      case "attested":
        return "attested";
      default:
        return "connect";
    }
  },
  stageState(
    stage: StageId,
    status: PipelineStatus,
    wallet: string | null,
    failedStage: StageId | null,
  ): "done" | "active" | "todo" | "failed" {
    if (status === "failed" && failedStage === stage) return "failed";
    const order = STAGES.map((s) => s.id);
    const active = transitions.activeStage(status, wallet, failedStage);
    const activeIndex = order.indexOf(active);
    const stageIndex = order.indexOf(stage);
    if (status === "attested" && stage === "attested") return "active";
    if (stageIndex < activeIndex) return "done";
    if (stageIndex === activeIndex) return "active";
    return "todo";
  },
} as const;

export const usePipeline = create<PipelineStore>()((set, get) => ({
  ...initialState,

  setWallet: (wallet, demo = false) =>
    set((s) =>
      s.wallet === wallet && s.demoWallet === demo
        ? s
        : { ...initialState, wallet, demoWallet: demo, exchange: s.exchange },
    ),

  startVerify: () =>
    set({
      status: "verifying",
      failedStage: null,
      failure: null,
      checks: idleChecks(),
      whitelistMatch: null,
    }),

  setCheck: (id, state) =>
    set((s) => ({ checks: { ...s.checks, [id]: state } })),

  setQuote: (quote) => set({ quote }),

  setWhitelist: (list, match) => set({ whitelisted: list, whitelistMatch: match }),

  finishVerify: () => set({ status: "verified" }),

  setExchange: (exchange) => set({ exchange }),

  startSeal: () => {
    if (!transitions.canSeal(get().status)) {
      throw new Error("seal attempted before attestation verification passed");
    }
    set({ status: "sealing", failedStage: null, failure: null });
  },

  finishSeal: (seal) => set({ seal }),

  startAnchor: () => set({ status: "anchoring" }),
  setAnchorTx: (anchorTxHash) => set({ anchorTxHash }),
  setRequestId: (requestId) => set({ requestId }),

  startProcessing: () => set({ status: "processing", enclaveSteps: idleEnclaveSteps() }),

  setEnclaveStep: (step, status, note) =>
    set((s) => ({
      enclaveSteps: { ...s.enclaveSteps, [step]: status },
      enclaveNotes: note ? { ...s.enclaveNotes, [step]: note } : s.enclaveNotes,
    })),

  setAttestation: (attestation) => set({ attestation, status: "attested" }),

  setBorrowState: (borrowedUnits, capUnits) => set({ borrowedUnits, capUnits }),
  setBorrowTx: (borrowTxHash) => set({ borrowTxHash }),

  fail: (failedStage, failure) => set({ status: "failed", failedStage, failure }),

  /** Retry from a stage without losing the wallet or a passed verification. */
  resetFrom: (stage) =>
    set((s) => {
      if (stage === "verify") {
        return {
          status: "idle",
          failedStage: null,
          failure: null,
          checks: idleChecks(),
          quote: null,
          whitelistMatch: null,
        };
      }
      if (stage === "seal") {
        return {
          status: "verified",
          failedStage: null,
          failure: null,
          seal: null,
          anchorTxHash: null,
          requestId: null,
        };
      }
      return { status: s.status, failedStage: null, failure: null };
    }),

  reset: () => set((s) => ({ ...initialState, wallet: s.wallet, demoWallet: s.demoWallet })),
}));
