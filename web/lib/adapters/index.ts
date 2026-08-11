import { IS_MOCK } from "@/lib/config/mode";
import type { ChainClient, EnclaveClient } from "@/lib/adapters/types";

import { LiveChainClient } from "./live/chain";
import { LiveEnclaveClient } from "./live/enclave";
import { MockChainClient } from "./mock/chain";
import { MockEnclaveClient } from "./mock/enclave";

/**
 * The one place the app decides which world it is talking to.
 * Instantiated lazily so the mock enclave's keygen does not run during SSR.
 */
let enclave: EnclaveClient | null = null;
let chain: ChainClient | null = null;

export function getEnclaveClient(): EnclaveClient {
  if (!enclave) enclave = IS_MOCK ? new MockEnclaveClient() : new LiveEnclaveClient();
  return enclave;
}

export function getChainClient(): ChainClient {
  if (!chain) chain = IS_MOCK ? new MockChainClient() : new LiveChainClient();
  return chain;
}

export type { AttestationQuote, AttestationRecord, ChainClient, EnclaveClient } from "./types";
