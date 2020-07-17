// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

abstract contract DuskToken is ERC20 {
    using SafeMath for uint256;
    
    constructor() public {
        // Send all 500,000,000 tokens to contract creator
        _mint(msg.sender, uint256(500000000).mul(10**uint(18)));
    }
}