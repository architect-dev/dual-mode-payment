// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { ERC20Confidential } from "./vendor/ERC20Confidential/ERC20Confidential.sol";

/**
 * @title DualUSD (dUSD)
 * @dev Demo-only dual-mode token. Everything confidential (shield, unshield + claim,
 * confidential transfers, indicator) is the audited ERC20Confidential base, vendored
 * unchanged from fusd-jmi (see vendor/SOURCE_COMMIT). The only addition is an open,
 * capped faucet so anyone can try the demo on testnet.
 *
 * 6 public decimals -> 6 confidential decimals -> conversion rate 1 (no shield dust).
 */
contract DualUSD is ERC20Confidential {
    uint256 public constant FAUCET_CAP = 10_000 * 1e6;

    error FaucetCapExceeded(uint256 requested, uint256 cap);

    constructor() ERC20Confidential("Fhenix Dual USD", "dUSD", 6) {}

    /// @notice Testnet faucet: mint up to {FAUCET_CAP} public dUSD to `to`.
    function mint(address to, uint256 amount) external {
        if (amount > FAUCET_CAP) revert FaucetCapExceeded(amount, FAUCET_CAP);
        _mint(to, amount);
    }
}
