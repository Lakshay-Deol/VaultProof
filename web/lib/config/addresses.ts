import { keccak256, toHex } from "viem";

import { IS_MOCK } from "./mode";

/**
 * Every Coston2 address the app knows about, in one file.
 *
 * Going live is a two-step change: fill in the `live` block below with the
 * deployed addresses, then set NEXT_PUBLIC_VAULTPROOF_MODE=live. Nothing in
 * components/ or app/ references an address literal.
 */
export type ContractKey =
  | "solvencyRegistry"
  | "lendingPool"
  | "instructionSender"
  | "teeExtensionRegistry"
  | "usdc";

export interface ContractEntry {
  key: ContractKey;
  label: string;
  address: `0x${string}`;
  /** One line of "what this is", rendered in the footer and on /how-it-works. */
  blurb: string;
  /** True when the address is a stand-in and must not be presented as deployed. */
  placeholder: boolean;
}

/**
 * Deployed on Coston2 (2026-08-12, deployer 0xEa0de9C49d2E935a2c3757F82a42f1e00ab2730e),
 * verified on Blockscout. Source of truth: contracts/deployment-addresses.vaultproof.json,
 * written by script/vaultproof/DeployVaultProof.s.sol.
 */
const live: Record<ContractKey, `0x${string}`> = {
  solvencyRegistry: "0xD653bE4c296E2462D22254953D2Aaa7D4DA1917C",
  lendingPool: "0x3b7c700cd2d812348de61BD13b28e601C661b5Da",
  instructionSender: "0x45540745B838F6f3feC76E662b5539BcB82339c3",
  // VaultProof's own TeeMeasurementRegistry: Flare's Coston2 protocol
  // contracts do not yet expose an `isWhitelisted` measurement surface, so we
  // deploy the whitelist ourselves and swap to the protocol registry later.
  teeExtensionRegistry: "0xe1788fF42Fc5a5B4012d5af6f8B51fe3a3eF36f7",
  usdc: "0x459c634EE948f6D486b714E06C1F186034F2e7A4",
};

/**
 * Deterministic stand-ins used in mock mode. They are real-looking so the UI
 * layout is honest, and every surface that renders them also renders a "mock"
 * tag so nobody mistakes one for a deployment.
 */
const mock: Record<ContractKey, `0x${string}`> = {
  solvencyRegistry: "0x9f2c41Ae7B3d5E80C6a1F4b28D93Ec7A05B61d34",
  lendingPool: "0x3Ad7c50B19eF84a26Db1c9F730aE5c8842B0f19c",
  instructionSender: "0xC41b0e7A65D3f92B18cE4a70Df85631bA9e2d5C7",
  teeExtensionRegistry: "0x5B8fD2C7a41E90b36Ce7A15dF248b90C63Ea7f11",
  usdc: "0x7E4a1C93bD05f682Ae3c17B49dF206aC85b3e0F2",
};

const source = IS_MOCK ? mock : live;

export const ADDRESSES = source;

export const CONTRACTS: ContractEntry[] = [
  {
    key: "solvencyRegistry",
    label: "SolvencyRegistry",
    address: source.solvencyRegistry,
    blurb: "Stores tier, expiry, nullifier and measurement. Never a balance.",
    placeholder: IS_MOCK,
  },
  {
    key: "lendingPool",
    label: "LendingPool",
    address: source.lendingPool,
    blurb: "Reads the tier, sets the borrow cap, releases funds.",
    placeholder: IS_MOCK,
  },
  {
    key: "instructionSender",
    label: "InstructionSender",
    address: source.instructionSender,
    blurb: "The only address allowed to submit instructions to the enclave.",
    placeholder: IS_MOCK,
  },
  {
    key: "teeExtensionRegistry",
    label: "TeeMeasurementRegistry",
    address: source.teeExtensionRegistry,
    blurb: "On-chain whitelist of trusted enclave code hashes.",
    placeholder: IS_MOCK,
  },
];

/**
 * OPType / OPCommand routing pair. Derived, not transcribed — a hand-copied
 * hash that drifts from VaultProofConstants.sol produces instructions that
 * vanish with no error (spec §8).
 */
export const OP_TYPE_LABEL = 'keccak256("VAULTPROOF")';
export const OP_COMMAND_LABEL = 'keccak256("ATTEST_SOLVENCY")';
export const OP_TYPE = keccak256(toHex("VAULTPROOF"));
export const OP_COMMAND = keccak256(toHex("ATTEST_SOLVENCY"));
