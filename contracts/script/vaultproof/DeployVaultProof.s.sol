// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {LendingPool} from "../../src/vaultproof/LendingPool.sol";
import {MockUSDC} from "../../src/vaultproof/MockUSDC.sol";
import {SolvencyRegistry} from "../../src/vaultproof/SolvencyRegistry.sol";
import {TeeMeasurementRegistry} from "../../src/vaultproof/TeeMeasurementRegistry.sol";
import {VaultProofInstructionSender} from "../../src/vaultproof/VaultProofInstructionSender.sol";

/// @notice Deploys the whole VaultProof stack in one broadcast and wires it up.
///
/// Order matters because of the two-step sender<->registry wiring:
///   1. MockUSDC                    (the pool's asset)
///   2. TeeMeasurementRegistry      (enclave code-hash whitelist)
///   3. VaultProofInstructionSender (registry not set yet)
///   4. SolvencyRegistry(sender, teeRegistry)   — both immutable
///   5. sender.setRegistry(registry)
///   6. LendingPool(registry, usdc)
///   7. Seed: fund the pool, whitelist the current enclave measurement.
///
/// Env:
///   PRIVATE_KEY            deployer (funded C2FLR)
///   ENCLAVE_MEASUREMENT    optional bytes32; defaults to the simulated-TEE
///                          build tag hash so the demo pipeline works before
///                          the Confidential Space build is final.
///
/// Run:
///   forge script script/vaultproof/DeployVaultProof.s.sol --rpc-url coston2 --broadcast
contract DeployVaultProof is Script {
    uint256 constant POOL_LIQUIDITY = 1_000_000e6; // 1M tUSDC

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        // Simulated-TEE stand-in, replaced via `list()` when the reproducible
        // Confidential Space image hash is final.
        bytes32 measurement = vm.envOr(
            "ENCLAVE_MEASUREMENT",
            keccak256("vaultproof-fce:v0.3.1:simulated")
        );

        vm.startBroadcast(pk);

        MockUSDC usdc = new MockUSDC();
        TeeMeasurementRegistry teeRegistry = new TeeMeasurementRegistry();
        VaultProofInstructionSender sender = new VaultProofInstructionSender();
        SolvencyRegistry registry = new SolvencyRegistry(address(sender), address(teeRegistry));
        sender.setRegistry(registry);
        LendingPool pool = new LendingPool(address(registry), address(usdc));

        usdc.mint(address(pool), POOL_LIQUIDITY);
        teeRegistry.list(measurement, "vaultproof-fce:v0.3.1 (simulated TEE)");

        vm.stopBroadcast();

        console.log("MockUSDC:                  ", address(usdc));
        console.log("TeeMeasurementRegistry:    ", address(teeRegistry));
        console.log("VaultProofInstructionSender:", address(sender));
        console.log("SolvencyRegistry:          ", address(registry));
        console.log("LendingPool:               ", address(pool));
        console.log("Whitelisted measurement:");
        console.logBytes32(measurement);

        // Machine-readable hand-off for the web app (lib/config/addresses.ts).
        string memory obj = "vaultproof";
        vm.serializeAddress(obj, "usdc", address(usdc));
        vm.serializeAddress(obj, "teeMeasurementRegistry", address(teeRegistry));
        vm.serializeAddress(obj, "instructionSender", address(sender));
        vm.serializeAddress(obj, "solvencyRegistry", address(registry));
        string memory out = vm.serializeAddress(obj, "lendingPool", address(pool));
        vm.writeJson(out, "./deployment-addresses.vaultproof.json");
    }
}
