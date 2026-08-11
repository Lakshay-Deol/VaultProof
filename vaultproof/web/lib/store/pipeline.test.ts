import { beforeEach, describe, expect, it } from "vitest";

import { initialState, transitions, usePipeline, type StageId } from "./pipeline";

const WALLET = "0x7a3fD1c48B0E9265aF71c3b8De04517Ab9e6c19d" as const;

beforeEach(() => {
  // Merge, not replace: a replacing setState would strip the actions too.
  usePipeline.setState(initialState);
});

/**
 * The gate is the product. These tests exist so a refactor that makes the seal
 * form reachable without a passing verification fails CI rather than shipping.
 */
describe("sealing gate", () => {
  it("refuses to start sealing before verification passes", () => {
    const store = usePipeline.getState();
    store.setWallet(WALLET);
    expect(() => usePipeline.getState().startSeal()).toThrow(
      /before attestation verification passed/,
    );
    expect(usePipeline.getState().status).not.toBe("sealing");
  });

  it("refuses to start sealing while verification is still running", () => {
    usePipeline.getState().setWallet(WALLET);
    usePipeline.getState().startVerify();
    expect(usePipeline.getState().status).toBe("verifying");
    expect(() => usePipeline.getState().startSeal()).toThrow();
  });

  it("allows sealing once verification has finished", () => {
    usePipeline.getState().setWallet(WALLET);
    usePipeline.getState().startVerify();
    usePipeline.getState().finishVerify();
    expect(usePipeline.getState().status).toBe("verified");
    expect(() => usePipeline.getState().startSeal()).not.toThrow();
    expect(usePipeline.getState().status).toBe("sealing");
  });

  it("closes the gate again when a fresh quote is requested", () => {
    usePipeline.getState().setWallet(WALLET);
    usePipeline.getState().startVerify();
    usePipeline.getState().finishVerify();
    usePipeline.getState().resetFrom("verify");
    expect(usePipeline.getState().status).toBe("idle");
    expect(() => usePipeline.getState().startSeal()).toThrow();
  });

  it("closes the gate when the wallet changes", () => {
    usePipeline.getState().setWallet(WALLET);
    usePipeline.getState().startVerify();
    usePipeline.getState().finishVerify();
    usePipeline.getState().setWallet("0x0000000000000000000000000000000000000001");
    expect(usePipeline.getState().status).toBe("idle");
    expect(usePipeline.getState().quote).toBeNull();
    expect(() => usePipeline.getState().startSeal()).toThrow();
  });

  it("canSeal only admits verified, sealing and failed", () => {
    expect(transitions.canSeal("idle")).toBe(false);
    expect(transitions.canSeal("verifying")).toBe(false);
    expect(transitions.canSeal("verified")).toBe(true);
    expect(transitions.canSeal("sealing")).toBe(true);
    expect(transitions.canSeal("anchoring")).toBe(false);
    expect(transitions.canSeal("processing")).toBe(false);
    expect(transitions.canSeal("attested")).toBe(false);
  });
});

describe("stage progression", () => {
  it("stays on connect until a wallet exists", () => {
    expect(transitions.activeStage("idle", null, null)).toBe("connect");
    expect(transitions.activeStage("verifying", null, null)).toBe("connect");
    expect(transitions.activeStage("idle", WALLET, null)).toBe("verify");
  });

  it("maps each status to the stage the user is looking at", () => {
    const cases: Array<[Parameters<typeof transitions.activeStage>[0], StageId]> = [
      ["verifying", "verify"],
      ["verified", "seal"],
      ["sealing", "seal"],
      ["anchoring", "anchor"],
      ["processing", "processing"],
      ["attested", "attested"],
    ];
    for (const [status, stage] of cases) {
      expect(transitions.activeStage(status, WALLET, null)).toBe(stage);
    }
  });

  it("points at the failed stage when the flow hard-stops", () => {
    expect(transitions.activeStage("failed", WALLET, "verify")).toBe("verify");
    expect(transitions.stageState("verify", "failed", WALLET, "verify")).toBe("failed");
    // Later stages must not read as done just because the pipeline stopped.
    expect(transitions.stageState("seal", "failed", WALLET, "verify")).toBe("todo");
  });

  it("marks earlier stages done and later ones todo", () => {
    expect(transitions.stageState("connect", "processing", WALLET, null)).toBe("done");
    expect(transitions.stageState("seal", "processing", WALLET, null)).toBe("done");
    expect(transitions.stageState("processing", "processing", WALLET, null)).toBe("active");
    expect(transitions.stageState("attested", "processing", WALLET, null)).toBe("todo");
  });

  it("keeps the final stage active rather than done at the end", () => {
    expect(transitions.stageState("attested", "attested", WALLET, null)).toBe("active");
  });
});

describe("borrowing", () => {
  it("requires an attestation with a live tier", () => {
    expect(transitions.canBorrow("attested", 3)).toBe(true);
    expect(transitions.canBorrow("attested", 0)).toBe(false);
    expect(transitions.canBorrow("attested", undefined)).toBe(false);
    expect(transitions.canBorrow("processing", 3)).toBe(false);
  });
});

describe("credential hygiene", () => {
  it("has no field capable of holding a plaintext credential", () => {
    const keys = Object.keys(initialState);
    for (const forbidden of ["apiKey", "apiSecret", "secret", "credential", "plaintext"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("keeps only ciphertext-derived values in the seal artifact", () => {
    usePipeline.getState().setWallet(WALLET);
    usePipeline.getState().startVerify();
    usePipeline.getState().finishVerify();
    usePipeline.getState().startSeal();
    usePipeline.getState().finishSeal({
      preview: "0x04a1",
      byteLength: 612,
      requestHash: "0xabc",
      nonce: "0xdef",
      responsePubKey: "0x123",
    });
    const seal = usePipeline.getState().seal!;
    expect(Object.keys(seal).sort()).toEqual(
      ["byteLength", "nonce", "preview", "requestHash", "responsePubKey"].sort(),
    );
  });

  it("reset keeps the wallet but drops every artifact", () => {
    usePipeline.getState().setWallet(WALLET, true);
    usePipeline.getState().startVerify();
    usePipeline.getState().finishVerify();
    usePipeline.getState().reset();
    const state = usePipeline.getState();
    expect(state.wallet).toBe(WALLET);
    expect(state.demoWallet).toBe(true);
    expect(state.status).toBe("idle");
    expect(state.seal).toBeNull();
    expect(state.attestation).toBeNull();
    expect(state.anchorTxHash).toBeNull();
  });
});
