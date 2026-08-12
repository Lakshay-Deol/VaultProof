// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {TeeMeasurementRegistry} from "../../src/vaultproof/TeeMeasurementRegistry.sol";

/// @notice Lists (or delists) an enclave measurement in TeeMeasurementRegistry.
///
/// This is the step that makes a Confidential Space build usable. The frontend
/// refuses to seal a credential to any enclave whose measurement is not in this
/// registry (stage 2, check c), and `SolvencyRegistry` re-checks it at write
/// time — so until the deployed image's digest is listed here, the pipeline
/// stops before anything is encrypted. That is the intended behaviour, not a
/// misconfiguration.
///
/// The measurement is the image digest the Confidential Space launcher signs:
/// `submods.container.image_digest` in the attestation token, as a bare bytes32
/// (the `sha256:` prefix stripped, `0x` prepended). Read it from a running
/// enclave with `curl -s $ENCLAVE_URL/quote | jq -r .measurement`, or derive it
/// locally from the pushed image with:
///
///   docker inspect --format '{{index .RepoDigests 0}}' vaultproof-fce:v0.4.0
///
/// Both must agree. If they do not, the image you deployed is not the image you
/// built, and listing the digest anyway would whitelist a build nobody can
/// reproduce.
///
/// Env:
///   PRIVATE_KEY          registry owner (the deployer)
///   TEE_REGISTRY         address of the deployed TeeMeasurementRegistry
///   ENCLAVE_MEASUREMENT  bytes32 image digest to list
///   MEASUREMENT_LABEL    optional build tag, emitted in the event only
///   DELIST               optional; set to true to revoke instead of list
///
/// Run:
///   FOUNDRY_PROFILE=vaultproof forge script \
///     script/vaultproof/WhitelistMeasurement.s.sol \
///     --rpc-url coston2 --broadcast
contract WhitelistMeasurement is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address registryAddress = vm.envAddress("TEE_REGISTRY");
        bytes32 measurement = vm.envBytes32("ENCLAVE_MEASUREMENT");
        string memory label = vm.envOr("MEASUREMENT_LABEL", string("vaultproof-fce"));
        bool delist = vm.envOr("DELIST", false);

        // A zero measurement would list "no build" as trusted, and the registry
        // itself has no reason to reject it. Catch it here rather than on-chain.
        require(measurement != bytes32(0), "ENCLAVE_MEASUREMENT is zero");

        TeeMeasurementRegistry registry = TeeMeasurementRegistry(registryAddress);

        vm.startBroadcast(pk);
        if (delist) {
            registry.delist(measurement);
        } else {
            registry.list(measurement, label);
        }
        vm.stopBroadcast();

        console.log(delist ? "Delisted measurement:" : "Listed measurement:");
        console.logBytes32(measurement);
        console.log("Registry:      ", registryAddress);
        console.log("Label:         ", label);

        // Read it back through the same function the frontend calls, so the
        // script fails loudly if the write did not take effect.
        bool listed = registry.isWhitelisted(measurement);
        console.log("isWhitelisted: ", listed);
        require(listed == !delist, "registry state does not match the requested change");
    }
}
