// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {VaultProofConstants} from "./VaultProofConstants.sol";

interface ITeeExtensionRegistry {
    function isWhitelisted(bytes32 measurement) external view returns (bool);
}

/// @notice Stores enclave-signed solvency attestations: tier, expiry, nullifier, measurement.
/// Never stores balances, exchange names, or account identifiers.
contract SolvencyRegistry {
    struct Attestation {
        uint8 tier; // 0..4
        uint64 issuedAt;
        uint64 expiresAt;
        bytes32 nullifier; // stable per exchange account, unlinkable
        bytes32 measurement; // which enclave build produced this
    }

    address public immutable instructionSender; // only caller allowed
    address public immutable teeRegistry;

    mapping(address => Attestation) public attestations;
    mapping(bytes32 => address) public nullifierOwner;
    mapping(bytes32 => bool) public usedNonce;

    event Attested(address indexed wallet, uint8 tier, uint64 expiresAt, bytes32 measurement);
    event Revoked(address indexed wallet);

    error NotInstructionSender();
    error NullifierBound();
    error NonceReplayed();
    error StaleMeasurement();

    constructor(address _sender, address _teeRegistry) {
        instructionSender = _sender;
        teeRegistry = _teeRegistry;
    }

    modifier onlySender() {
        if (msg.sender != instructionSender) revert NotInstructionSender();
        _;
    }

    function submitAttestation(
        address wallet,
        uint8 tier,
        uint64 validForSeconds,
        bytes32 nullifier,
        bytes32 nonce,
        bytes32 measurement
    ) external onlySender {
        if (usedNonce[nonce]) revert NonceReplayed();
        if (!ITeeExtensionRegistry(teeRegistry).isWhitelisted(measurement)) revert StaleMeasurement();

        address bound = nullifierOwner[nullifier];
        if (bound != address(0) && bound != wallet) {
            // the same exchange account already backs a different wallet
            if (block.timestamp < attestations[bound].expiresAt) revert NullifierBound();
        }

        usedNonce[nonce] = true;
        nullifierOwner[nullifier] = wallet;
        attestations[wallet] = Attestation({
            tier: tier,
            issuedAt: uint64(block.timestamp),
            expiresAt: uint64(block.timestamp) + validForSeconds,
            nullifier: nullifier,
            measurement: measurement
        });

        emit Attested(wallet, tier, uint64(block.timestamp) + validForSeconds, measurement);
    }

    /// @notice Expiry is enforced here, in the read path, so a stale attestation
    /// cannot be used even if nobody prunes it.
    function tierOf(address wallet) public view returns (uint8) {
        Attestation memory a = attestations[wallet];
        if (block.timestamp >= a.expiresAt) return 0; // expired reads as no credit
        return a.tier;
    }
}
