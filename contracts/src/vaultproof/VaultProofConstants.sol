// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Routing constants. These MUST match the Go extension config
/// (extension/go/internal/config/config.go). A silent mismatch produces a
/// request that vanishes with no error, so change both sides together.
library VaultProofConstants {
    bytes32 constant OP_TYPE = keccak256("VAULTPROOF");
    bytes32 constant OP_SOLVENCY = keccak256("ATTEST_SOLVENCY");

    uint64 constant ATTESTATION_VALIDITY = 86400; // 24h; freshness checked at drawdown
}
