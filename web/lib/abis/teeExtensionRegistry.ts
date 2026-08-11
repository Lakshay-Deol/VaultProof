/**
 * Flare protocol contract. `isWhitelisted` is the piece VaultProof depends on:
 * it is what makes "trust the code hash, not the operator" checkable by anyone.
 * The instruction surface is transcribed from
 * extension/contracts/interfaces/ITeeExtensionRegistry.sol.
 */
export const teeExtensionRegistryAbi = [
  {
    type: "function",
    name: "isWhitelisted",
    stateMutability: "view",
    inputs: [{ name: "measurement", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "nextPublicExtensionId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getTeeExtensionInstructionsSender",
    stateMutability: "view",
    inputs: [{ name: "_extensionId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "sendInstructions",
    stateMutability: "payable",
    inputs: [
      { name: "_teeIds", type: "address[]" },
      {
        name: "_instructionParams",
        type: "tuple",
        components: [
          { name: "opType", type: "bytes32" },
          { name: "opCommand", type: "bytes32" },
          { name: "message", type: "bytes" },
          { name: "cosigners", type: "address[]" },
          { name: "cosignersThreshold", type: "uint64" },
          { name: "claimBackAddress", type: "address" },
        ],
      },
    ],
    outputs: [{ name: "_instructionId", type: "bytes32" }],
  },
] as const;
