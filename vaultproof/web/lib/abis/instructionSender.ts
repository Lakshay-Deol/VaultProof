/**
 * VaultProof's InstructionSender: the only address the TeeExtensionRegistry
 * accepts instructions from for this extension.
 *
 * `submitRequest` anchors keccak256(sealedBlob) on-chain before the ciphertext
 * is delivered anywhere (spec §5, steps 5–7). The enclave refuses to process a
 * blob whose hash does not appear in a confirmed RequestSubmitted event.
 */
export const instructionSenderAbi = [
  {
    type: "function",
    name: "submitRequest",
    stateMutability: "payable",
    inputs: [{ name: "requestHash", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setExtensionId",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "OP_TYPE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "OP_SOLVENCY",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "event",
    name: "RequestSubmitted",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "requestHash", type: "bytes32", indexed: true },
    ],
  },
] as const;
