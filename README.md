# DUSK Pre-staking Ethereum Smart Contract

This repository contains the smart contract code for the DUSK pre-staking contract. The aim is to have a smart contract, which can lock up DUSK ERC-20 tokens, in return for a daily reward.

For testing purposes, this repository also contains the smart contract code for the DUSK ERC-20 token.

The tests were ran with `truffle` version 5.1.34, with the contracts compiled with `solc` version 0.6.12. The coverage reports were generated with `solidity-coverage` 0.7.9. Test coverage is currently 100% on all fields, except for lines - this is due to the fact that `solidity-coverage` does not seem to register when the `receive` function is triggered. Despite this, there is a test included in the suite which ensures that any ether received is reverted. (`test/prestaking.js:385`).