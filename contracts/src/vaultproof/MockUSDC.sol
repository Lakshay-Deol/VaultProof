// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin-contracts/token/ERC20/ERC20.sol";

/// @notice Testnet stand-in for USDC: 6 decimals, open faucet so judges can
/// repay without asking us for tokens. Real value never touches this contract.
contract MockUSDC is ERC20 {
    uint8 private constant DECIMALS = 6;
    uint256 public constant FAUCET_AMOUNT = 10_000e6; // 10k tUSDC per call

    address public immutable owner;

    constructor() ERC20("VaultProof Test USD", "tUSDC") {
        owner = msg.sender;
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Anyone can top up; it is a testnet demo token.
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Owner mint, used once at deploy time to fund the LendingPool.
    function mint(address to, uint256 amount) external {
        require(msg.sender == owner, "not owner");
        _mint(to, amount);
    }
}
