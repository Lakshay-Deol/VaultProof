// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {SolvencyRegistry} from "./SolvencyRegistry.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Minimal lending pool that reads solvency tiers from SolvencyRegistry.
/// The attestation extends the borrowing cap; it does not replace collateral.
contract LendingPool {
    SolvencyRegistry public immutable registry;
    IERC20 public immutable asset; // e.g. testnet USDC, 6 decimals

    // T0..T4 caps in asset units (6 decimals)
    uint256[5] public tierCap = [0, 2_000e6, 8_000e6, 40_000e6, 150_000e6];

    mapping(address => uint256) public borrowed;

    event Borrowed(address indexed who, uint256 amount);
    event Repaid(address indexed who, uint256 amount);

    constructor(address _registry, address _asset) {
        registry = SolvencyRegistry(_registry);
        asset = IERC20(_asset);
    }

    function borrow(uint256 amount) external {
        uint8 tier = registry.tierOf(msg.sender);
        require(tier > 0, "no valid attestation");

        uint256 onChainCollateralValue = _collateralValue(msg.sender);
        uint256 cap = tierCap[tier] + onChainCollateralValue; // off-chain worth extends the cap
        require(borrowed[msg.sender] + amount <= cap, "over cap");

        borrowed[msg.sender] += amount;
        asset.transfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    function repay(uint256 amount) external {
        borrowed[msg.sender] -= amount;
        asset.transferFrom(msg.sender, address(this), amount);
        emit Repaid(msg.sender, amount);
    }

    /// @dev Stubbed for the hackathon: wire this to real deposited collateral
    /// (or FTSO-priced FLR deposits) if time allows. Returning 0 keeps the
    /// demo honest: the borrow is backed purely by the attested tier.
    function _collateralValue(address) internal pure returns (uint256) {
        return 0;
    }
}
