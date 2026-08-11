/**
 * Transcribed from contracts/src/vaultproof/SolvencyRegistry.sol.
 * Only the surface the dapp reads or watches; the write path goes through
 * InstructionSender, never directly.
 */
export const solvencyRegistryAbi = [
  {
    type: "function",
    name: "submitAttestation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "tier", type: "uint8" },
      { name: "validForSeconds", type: "uint64" },
      { name: "nullifier", type: "bytes32" },
      { name: "nonce", type: "bytes32" },
      { name: "measurement", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "tierOf",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "attestations",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "tier", type: "uint8" },
      { name: "issuedAt", type: "uint64" },
      { name: "expiresAt", type: "uint64" },
      { name: "nullifier", type: "bytes32" },
      { name: "measurement", type: "bytes32" },
    ],
  },
  {
    type: "function",
    name: "nullifierOwner",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "usedNonce",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "instructionSender",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "teeRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "Attested",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "tier", type: "uint8", indexed: false },
      { name: "expiresAt", type: "uint64", indexed: false },
      { name: "measurement", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Revoked",
    inputs: [{ name: "wallet", type: "address", indexed: true }],
  },
  { type: "error", name: "NotInstructionSender", inputs: [] },
  { type: "error", name: "NullifierBound", inputs: [] },
  { type: "error", name: "NonceReplayed", inputs: [] },
  { type: "error", name: "StaleMeasurement", inputs: [] },
] as const;
