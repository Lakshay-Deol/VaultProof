// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";

import {LendingPool} from "../../src/vaultproof/LendingPool.sol";
import {MockUSDC} from "../../src/vaultproof/MockUSDC.sol";
import {SolvencyRegistry} from "../../src/vaultproof/SolvencyRegistry.sol";
import {TeeMeasurementRegistry} from "../../src/vaultproof/TeeMeasurementRegistry.sol";
import {VaultProofInstructionSender} from "../../src/vaultproof/VaultProofInstructionSender.sol";

/// @notice Full-stack flow test against the exact wiring the deploy script
/// produces: anchor -> deliver -> tier -> borrow, plus every revert path the
/// registry promises (replay, rebind, stale measurement, expiry).
contract VaultProofTest is Test {
    MockUSDC usdc;
    TeeMeasurementRegistry teeRegistry;
    VaultProofInstructionSender sender;
    SolvencyRegistry registry;
    LendingPool pool;

    address deployer = makeAddr("deployer");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    bytes32 constant MEASUREMENT = keccak256("vaultproof-fce:v0.3.1:simulated");
    bytes32 constant NULLIFIER = keccak256("kraken-account-1");

    function setUp() public {
        vm.startPrank(deployer);
        usdc = new MockUSDC();
        teeRegistry = new TeeMeasurementRegistry();
        sender = new VaultProofInstructionSender();
        registry = new SolvencyRegistry(address(sender), address(teeRegistry));
        sender.setRegistry(registry);
        pool = new LendingPool(address(registry), address(usdc));

        usdc.mint(address(pool), 1_000_000e6);
        teeRegistry.list(MEASUREMENT, "test build");
        vm.stopPrank();
    }

    function _attest(address wallet, uint8 tier, bytes32 nullifier, bytes32 nonce) internal {
        vm.prank(deployer); // deployer is the teeExecutor until go-live
        sender.deliverAttestation(wallet, tier, 86400, nullifier, nonce, MEASUREMENT);
    }

    function test_fullFlow_anchorAttestBorrow() public {
        // 1. Alice anchors her sealed request hash.
        vm.prank(alice);
        sender.submitRequest(keccak256("sealed-blob"));

        // 2. The executor lands a T2 attestation.
        _attest(alice, 2, NULLIFIER, keccak256("nonce-1"));
        assertEq(registry.tierOf(alice), 2);

        // 3. Alice borrows inside the T2 cap (8,000 tUSDC).
        vm.prank(alice);
        pool.borrow(5_000e6);
        assertEq(usdc.balanceOf(alice), 5_000e6);

        // 4. Over the cap reverts.
        vm.prank(alice);
        vm.expectRevert(bytes("over cap"));
        pool.borrow(4_000e6);

        // 5. Repay works.
        vm.startPrank(alice);
        usdc.approve(address(pool), 1_000e6);
        pool.repay(1_000e6);
        vm.stopPrank();
        assertEq(pool.borrowed(alice), 4_000e6);
    }

    function test_expiredAttestationReadsAsTierZero() public {
        _attest(alice, 3, NULLIFIER, keccak256("nonce-1"));
        assertEq(registry.tierOf(alice), 3);

        vm.warp(block.timestamp + 86401);
        assertEq(registry.tierOf(alice), 0);

        vm.prank(alice);
        vm.expectRevert(bytes("no valid attestation"));
        pool.borrow(1e6);
    }

    function test_onlyInstructionSenderMayWrite() public {
        vm.prank(alice);
        vm.expectRevert(SolvencyRegistry.NotInstructionSender.selector);
        registry.submitAttestation(alice, 4, 86400, NULLIFIER, keccak256("n"), MEASUREMENT);
    }

    function test_onlyExecutorMayDeliver() public {
        vm.prank(alice);
        vm.expectRevert(VaultProofInstructionSender.NotExecutor.selector);
        sender.deliverAttestation(alice, 4, 86400, NULLIFIER, keccak256("n"), MEASUREMENT);
    }

    function test_nonceReplayReverts() public {
        _attest(alice, 2, NULLIFIER, keccak256("nonce-1"));
        vm.prank(deployer);
        vm.expectRevert(SolvencyRegistry.NonceReplayed.selector);
        sender.deliverAttestation(alice, 2, 86400, NULLIFIER, keccak256("nonce-1"), MEASUREMENT);
    }

    function test_nonWhitelistedMeasurementReverts() public {
        vm.prank(deployer);
        vm.expectRevert(SolvencyRegistry.StaleMeasurement.selector);
        sender.deliverAttestation(alice, 2, 86400, NULLIFIER, keccak256("nonce-1"), keccak256("rogue build"));
    }

    function test_delistedMeasurementReverts() public {
        vm.startPrank(deployer);
        teeRegistry.delist(MEASUREMENT);
        vm.expectRevert(SolvencyRegistry.StaleMeasurement.selector);
        sender.deliverAttestation(alice, 2, 86400, NULLIFIER, keccak256("nonce-1"), MEASUREMENT);
        vm.stopPrank();
    }

    function test_sameExchangeAccountCannotBackTwoWallets() public {
        _attest(alice, 2, NULLIFIER, keccak256("nonce-1"));
        vm.prank(deployer);
        vm.expectRevert(SolvencyRegistry.NullifierBound.selector);
        sender.deliverAttestation(bob, 2, 86400, NULLIFIER, keccak256("nonce-2"), MEASUREMENT);
    }

    function test_nullifierRebindsAfterExpiry() public {
        _attest(alice, 2, NULLIFIER, keccak256("nonce-1"));
        vm.warp(block.timestamp + 86401);
        _attest(bob, 1, NULLIFIER, keccak256("nonce-2"));
        assertEq(registry.tierOf(bob), 1);
    }

    function test_registryWiringIsOneShot() public {
        vm.prank(deployer);
        vm.expectRevert(VaultProofInstructionSender.RegistryAlreadySet.selector);
        sender.setRegistry(registry);
    }

    function test_faucetMints() public {
        vm.prank(bob);
        usdc.faucet();
        assertEq(usdc.balanceOf(bob), 10_000e6);
    }
}
