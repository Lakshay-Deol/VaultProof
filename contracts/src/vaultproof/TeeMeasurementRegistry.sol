// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice On-chain whitelist of trusted enclave code hashes (measurements).
///
/// Stands in for the `isWhitelisted` surface of Flare's TeeExtensionRegistry:
/// the FCC protocol contracts on Coston2 do not yet expose a public measurement
/// whitelist, so VaultProof deploys its own and points SolvencyRegistry at it.
/// The trust claim is unchanged — anyone can read which code hashes are
/// accepted, and an attestation from a non-listed build reverts on submit.
/// Swapping to the protocol registry later is a constructor argument, not a
/// code change (SolvencyRegistry only calls `isWhitelisted`).
contract TeeMeasurementRegistry {
    address public owner;

    mapping(bytes32 => bool) private whitelisted;
    /// @notice Every measurement ever listed, so the frontend can enumerate
    /// them without an indexer. Delisting keeps the entry but flips the flag.
    bytes32[] public knownMeasurements;

    event MeasurementListed(bytes32 indexed measurement, string label);
    event MeasurementDelisted(bytes32 indexed measurement);
    event OwnerChanged(address indexed previousOwner, address indexed newOwner);

    error NotOwner();

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @param label Human-readable build tag (e.g. "vaultproof-fce:v0.3.1"),
    /// emitted in the event only — the chain stores just the hash.
    function list(bytes32 measurement, string calldata label) external onlyOwner {
        if (!whitelisted[measurement]) {
            whitelisted[measurement] = true;
            knownMeasurements.push(measurement);
        }
        emit MeasurementListed(measurement, label);
    }

    /// @notice Kill switch for a compromised or superseded build.
    function delist(bytes32 measurement) external onlyOwner {
        whitelisted[measurement] = false;
        emit MeasurementDelisted(measurement);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    /// @notice The one function SolvencyRegistry depends on.
    function isWhitelisted(bytes32 measurement) external view returns (bool) {
        return whitelisted[measurement];
    }

    function measurementCount() external view returns (uint256) {
        return knownMeasurements.length;
    }
}
